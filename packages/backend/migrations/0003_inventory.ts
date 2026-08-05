import { type Kysely, sql } from 'kysely'

/**
 * Inventory — the heart of the project.
 *
 * The model is three numbers, only two of which are stored:
 *
 *     quantity   physically on the shelf at this store
 *     reserved   promised to carts/orders that have not shipped yet
 *     available  quantity - reserved   (derived, never stored)
 *
 * `available` is deliberately NOT a column. If you store it, you now have two
 * sources of truth that can disagree, and reconciling them is a bug factory.
 * Derive it in the query.
 *
 * The CHECK constraints below are the real guarantee. Application logic can be
 * wrong; a check constraint cannot be bypassed by any code path, any migration
 * script, or anyone poking at psql at 2am. If your reservation logic has a race,
 * these constraints turn a silent oversell into a loud transaction abort —
 * which is exactly the failure you want.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE inventory (
      store_id   uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
      quantity   integer NOT NULL DEFAULT 0,
      reserved   integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (store_id, product_id),
      CONSTRAINT inventory_quantity_non_negative CHECK (quantity >= 0),
      CONSTRAINT inventory_reserved_non_negative CHECK (reserved >= 0),
      CONSTRAINT inventory_reserved_within_quantity CHECK (reserved <= quantity)
    )
  `.execute(db)

  // Supports "what is low/out of stock at this store" without a full scan.
  await sql`
    CREATE INDEX inventory_low_stock_idx ON inventory (store_id)
    WHERE quantity - reserved <= 5
  `.execute(db)

  await sql`
    CREATE TYPE reservation_status AS ENUM ('held', 'committed', 'released', 'expired')
  `.execute(db)

  /**
   * A reservation is a time-boxed claim on stock.
   *
   * Why rows instead of just incrementing inventory.reserved? Because the
   * counter alone cannot answer "who holds this, and when does it expire?".
   * Without expiry, an abandoned checkout holds stock forever and your
   * bestsellers slowly become permanently unavailable while sitting on shelves.
   *
   * Lifecycle:
   *   held      -> stock claimed, expires_at ticking
   *   committed -> order paid; the hold became a real decrement
   *   released  -> user cancelled; reserved decremented, quantity untouched
   *   expired   -> the sweeper reclaimed it (Phase 5 background job)
   *
   * order_id is nullable because a hold is taken at checkout *before* the order
   * row is guaranteed to exist.
   */
  await sql`
    CREATE TABLE reservations (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id   uuid,
      store_id   uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
      quantity   integer NOT NULL,
      status     reservation_status NOT NULL DEFAULT 'held',
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT reservations_quantity_positive CHECK (quantity > 0)
    )
  `.execute(db)

  // The sweeper's query is "held reservations past expiry" — a partial index on
  // expires_at makes that a cheap index scan instead of a full table scan that
  // gets slower every day the table grows.
  await sql`
    CREATE INDEX reservations_expiry_idx ON reservations (expires_at)
    WHERE status = 'held'
  `.execute(db)

  await sql`CREATE INDEX reservations_order_idx ON reservations (order_id)`.execute(db)

  /**
   * Append-only audit of every stock movement.
   *
   * Counters tell you the current value; they never tell you how it got there.
   * The first time inventory looks wrong in production, this table is the only
   * thing that can answer "what happened". Write to it in the same transaction
   * as the change itself.
   */
  await sql`
    CREATE TABLE inventory_ledger (
      id          bigserial PRIMARY KEY,
      store_id    uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
      product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
      delta_qty   integer NOT NULL,
      delta_res   integer NOT NULL,
      reason      text NOT NULL,
      reference   uuid,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`
    CREATE INDEX inventory_ledger_lookup_idx
    ON inventory_ledger (store_id, product_id, created_at DESC)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS inventory_ledger`.execute(db)
  await sql`DROP TABLE IF EXISTS reservations`.execute(db)
  await sql`DROP TYPE IF EXISTS reservation_status`.execute(db)
  await sql`DROP TABLE IF EXISTS inventory`.execute(db)
}

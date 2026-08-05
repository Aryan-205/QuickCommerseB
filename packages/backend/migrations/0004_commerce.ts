import { type Kysely, sql } from 'kysely'

/**
 * Carts, coupons, orders, payments.
 *
 * Two ideas worth internalising here:
 *
 * 1. ORDERS SNAPSHOT EVERYTHING. An order row must never need a join to
 *    products or store_products to reproduce what the customer agreed to pay.
 *    Prices change; catalogue rows get deactivated; a receipt from March must
 *    still render correctly in December. Copy the values in at checkout.
 *
 * 2. STATE TRANSITIONS ARE DATA. The status enum plus order_status_history give
 *    you an auditable machine instead of scattered boolean flags.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TYPE cart_status AS ENUM ('active', 'converted', 'abandoned')`.execute(db)

  // A cart is scoped to a store: switching delivery address can change the
  // serving dark store, and prices/availability travel with it.
  await sql`
    CREATE TABLE carts (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      store_id   uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
      status     cart_status NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  // One active cart per user per store, enforced in the database. Doing this in
  // application code means two concurrent "add to cart" calls can create two
  // carts, and the user loses items non-deterministically.
  await sql`
    CREATE UNIQUE INDEX carts_one_active_per_user_store
    ON carts (user_id, store_id) WHERE status = 'active'
  `.execute(db)

  await sql`
    CREATE TABLE cart_items (
      cart_id    uuid NOT NULL REFERENCES carts (id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
      quantity   integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (cart_id, product_id),
      CONSTRAINT cart_items_quantity_positive CHECK (quantity > 0)
    )
  `.execute(db)

  // Cart items store no price on purpose: the cart always reflects live pricing
  // until checkout freezes it. Storing price here would show users a stale total.

  await sql`CREATE TYPE coupon_kind AS ENUM ('flat', 'percent')`.execute(db)

  await sql`
    CREATE TABLE coupons (
      code               text PRIMARY KEY,
      kind               coupon_kind NOT NULL,
      value              integer NOT NULL,
      min_order_paise    integer NOT NULL DEFAULT 0,
      max_discount_paise integer,
      valid_from         timestamptz NOT NULL DEFAULT now(),
      valid_until        timestamptz,
      usage_limit        integer,
      used_count         integer NOT NULL DEFAULT 0,
      per_user_limit     integer NOT NULL DEFAULT 1,
      is_active          boolean NOT NULL DEFAULT true,
      created_at         timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT coupons_value_positive CHECK (value > 0),
      CONSTRAINT coupons_percent_sane CHECK (kind <> 'percent' OR value <= 100),
      CONSTRAINT coupons_usage_within_limit CHECK (usage_limit IS NULL OR used_count <= usage_limit)
    )
  `.execute(db)

  await sql`
    CREATE TYPE order_status AS ENUM (
      'pending_payment',
      'reserved',
      'paid',
      'packed',
      'assigned',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'failed'
    )
  `.execute(db)

  /**
   * Money at order level is bigint. Line items fit comfortably in integer, but
   * totals aggregate, and widening a money column on a large live table later
   * is exactly the kind of migration that locks a table and takes the site down.
   * Pay the 4 extra bytes now.
   *
   * The address is snapshotted as text, not just referenced: users edit and
   * delete addresses, and a delivered order must always show where it went.
   */
  await sql`
    CREATE TABLE orders (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_number       text NOT NULL,
      user_id            uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      store_id           uuid NOT NULL REFERENCES stores (id) ON DELETE RESTRICT,
      address_id         uuid REFERENCES addresses (id) ON DELETE SET NULL,
      delivery_address   jsonb NOT NULL,
      status             order_status NOT NULL DEFAULT 'pending_payment',
      subtotal_paise     bigint NOT NULL,
      discount_paise     bigint NOT NULL DEFAULT 0,
      delivery_fee_paise bigint NOT NULL DEFAULT 0,
      total_paise        bigint NOT NULL,
      coupon_code        text REFERENCES coupons (code) ON DELETE SET NULL,
      placed_at          timestamptz NOT NULL DEFAULT now(),
      delivered_at       timestamptz,
      cancelled_at       timestamptz,
      cancellation_reason text,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT orders_totals_non_negative CHECK (
        subtotal_paise >= 0 AND discount_paise >= 0
        AND delivery_fee_paise >= 0 AND total_paise >= 0
      ),
      CONSTRAINT orders_total_is_consistent CHECK (
        total_paise = subtotal_paise - discount_paise + delivery_fee_paise
      )
    )
  `.execute(db)

  await sql`CREATE UNIQUE INDEX orders_number_key ON orders (order_number)`.execute(db)
  // Order history is always "this user's orders, newest first".
  await sql`CREATE INDEX orders_user_recent_idx ON orders (user_id, placed_at DESC)`.execute(db)
  // Ops view: what is in flight at this store right now.
  await sql`
    CREATE INDEX orders_store_active_idx ON orders (store_id, status)
    WHERE status NOT IN ('delivered', 'cancelled', 'failed')
  `.execute(db)

  await sql`
    CREATE TABLE order_items (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id         uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
      product_id       uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
      product_name     text NOT NULL,
      product_unit     text NOT NULL,
      unit_price_paise integer NOT NULL,
      quantity         integer NOT NULL,
      line_total_paise bigint NOT NULL,
      CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
      CONSTRAINT order_items_line_total_correct CHECK (
        line_total_paise = unit_price_paise::bigint * quantity
      )
    )
  `.execute(db)

  await sql`CREATE INDEX order_items_order_idx ON order_items (order_id)`.execute(db)

  /**
   * Append-only transition log. Every status change writes a row here in the
   * same transaction that changes orders.status. This is what lets you answer
   * "how long did this order sit in 'packed'?" — the single most common
   * operational question in quick commerce, and the basis of your SLA metrics.
   */
  await sql`
    CREATE TABLE order_status_history (
      id          bigserial PRIMARY KEY,
      order_id    uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
      from_status order_status,
      to_status   order_status NOT NULL,
      reason      text,
      actor       text,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`
    CREATE INDEX order_status_history_order_idx
    ON order_status_history (order_id, created_at)
  `.execute(db)

  await sql`
    CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded')
  `.execute(db)

  /**
   * One row per ATTEMPT, not one per order. A failed card retried successfully
   * must leave both facts on record — collapsing them loses the reconciliation
   * trail, and payments reconciliation is the thing finance will actually ask
   * you for.
   */
  await sql`
    CREATE TABLE payments (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id     uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
      attempt      integer NOT NULL DEFAULT 1,
      status       payment_status NOT NULL DEFAULT 'pending',
      amount_paise bigint NOT NULL,
      provider     text NOT NULL DEFAULT 'mock',
      provider_ref text,
      failure_code text,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT payments_amount_positive CHECK (amount_paise > 0)
    )
  `.execute(db)

  await sql`CREATE UNIQUE INDEX payments_order_attempt_key ON payments (order_id, attempt)`.execute(db)
  // At most one successful payment per order — a database-level guarantee
  // against double-charging, independent of whatever the application does.
  await sql`
    CREATE UNIQUE INDEX payments_one_success_per_order
    ON payments (order_id) WHERE status = 'succeeded'
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS payments`.execute(db)
  await sql`DROP TYPE IF EXISTS payment_status`.execute(db)
  await sql`DROP TABLE IF EXISTS order_status_history`.execute(db)
  await sql`DROP TABLE IF EXISTS order_items`.execute(db)
  await sql`DROP TABLE IF EXISTS orders`.execute(db)
  await sql`DROP TYPE IF EXISTS order_status`.execute(db)
  await sql`DROP TABLE IF EXISTS coupons`.execute(db)
  await sql`DROP TYPE IF EXISTS coupon_kind`.execute(db)
  await sql`DROP TABLE IF EXISTS cart_items`.execute(db)
  await sql`DROP TABLE IF EXISTS carts`.execute(db)
  await sql`DROP TYPE IF EXISTS cart_status`.execute(db)
}

import { type Kysely, sql } from 'kysely'

/**
 * Identity: users, refresh-token rotation, delivery addresses.
 *
 * Note on style: every statement gets its own `.execute()`. Kysely sends
 * queries over the extended protocol, which permits exactly one statement per
 * round trip — batching several into one template literal fails at runtime.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TYPE user_role AS ENUM ('customer', 'admin', 'picker', 'rider')`.execute(db)

  await sql`
    CREATE TABLE users (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email             text NOT NULL,
      phone             text,
      password_hash     text NOT NULL,
      role              user_role NOT NULL DEFAULT 'customer',
      email_verified_at timestamptz,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  // Uniqueness on lower(email), not on email. Otherwise 'A@x.com' and
  // 'a@x.com' are two accounts, which is an account-takeover vector at signup.
  // A functional index means lookups must also query lower(email) to be used.
  await sql`CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email))`.execute(db)

  // Partial index: phone is optional, and NULLs are not equal to each other in
  // Postgres, so a plain unique index would technically work — but the partial
  // form documents the intent and stays smaller.
  await sql`CREATE UNIQUE INDEX users_phone_key ON users (phone) WHERE phone IS NOT NULL`.execute(db)

  /**
   * Refresh-token rotation.
   *
   * Each refresh issues a new token and marks the old one replaced. `family_id`
   * ties a whole login session together, which is what makes replay detection
   * possible: if a token that was ALREADY replaced gets presented, the token was
   * stolen — revoke the entire family, not just that one row.
   *
   * Only the hash is stored. A database leak must not hand out live sessions.
   */
  await sql`
    CREATE TABLE refresh_tokens (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      family_id   uuid NOT NULL,
      token_hash  text NOT NULL,
      expires_at  timestamptz NOT NULL,
      revoked_at  timestamptz,
      replaced_by uuid REFERENCES refresh_tokens (id) ON DELETE SET NULL,
      user_agent  text,
      ip          inet,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`CREATE UNIQUE INDEX refresh_tokens_hash_key ON refresh_tokens (token_hash)`.execute(db)
  await sql`CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id)`.execute(db)
  await sql`
    CREATE INDEX refresh_tokens_active_idx ON refresh_tokens (user_id)
    WHERE revoked_at IS NULL
  `.execute(db)

  /**
   * Addresses carry lat/lng because serviceability is resolved from the
   * delivery point, not from the pincode. Pincodes are far too coarse — a
   * single one can span several dark-store catchments.
   */
  await sql`
    CREATE TABLE addresses (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      label        text,
      line1        text NOT NULL,
      line2        text,
      city         text NOT NULL,
      state        text NOT NULL,
      pincode      text NOT NULL,
      lat          double precision NOT NULL,
      lng          double precision NOT NULL,
      is_default   boolean NOT NULL DEFAULT false,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT addresses_lat_range CHECK (lat BETWEEN -90 AND 90),
      CONSTRAINT addresses_lng_range CHECK (lng BETWEEN -180 AND 180)
    )
  `.execute(db)

  await sql`CREATE INDEX addresses_user_idx ON addresses (user_id)`.execute(db)

  // At most one default address per user, enforced by the database rather than
  // by application code that races with itself.
  await sql`
    CREATE UNIQUE INDEX addresses_one_default_per_user
    ON addresses (user_id) WHERE is_default
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS addresses`.execute(db)
  await sql`DROP TABLE IF EXISTS refresh_tokens`.execute(db)
  await sql`DROP TABLE IF EXISTS users`.execute(db)
  await sql`DROP TYPE IF EXISTS user_role`.execute(db)
}

import { type Kysely, sql } from 'kysely'

/**
 * Dark stores and the catalog.
 *
 * The structural decision of the whole project lives here: a product's
 * *identity* is global, but its *price and availability* are per store.
 * `products` says what a thing is; `store_products` says what it costs here
 * and whether this store carries it at all.
 *
 * Get this wrong and every cache key, cart, and order downstream assumes a
 * global catalog — which is exactly the assumption that cannot be unwound
 * later.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  /**
   * Serviceability v1: a centre point plus a radius, matched with haversine.
   *
   * This is deliberately the naive model. Real catchments are polygons that
   * follow roads and rivers, and a radius will happily claim an address on the
   * far side of a highway with no bridge. The upgrade path is PostGIS —
   * `geography(Point)` columns, a GiST index, and `ST_Contains` against a real
   * service-area polygon. Do that when you want the harder version; document
   * the tradeoff either way.
   */
  await sql`
    CREATE TABLE stores (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code             text NOT NULL,
      name             text NOT NULL,
      lat              double precision NOT NULL,
      lng              double precision NOT NULL,
      service_radius_m integer NOT NULL DEFAULT 3000,
      is_active        boolean NOT NULL DEFAULT true,
      opens_at         time NOT NULL DEFAULT '06:00',
      closes_at        time NOT NULL DEFAULT '23:59',
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT stores_lat_range CHECK (lat BETWEEN -90 AND 90),
      CONSTRAINT stores_lng_range CHECK (lng BETWEEN -180 AND 180),
      CONSTRAINT stores_radius_positive CHECK (service_radius_m > 0)
    )
  `.execute(db)

  await sql`CREATE UNIQUE INDEX stores_code_key ON stores (code)`.execute(db)
  await sql`CREATE INDEX stores_active_idx ON stores (is_active) WHERE is_active`.execute(db)

  await sql`
    CREATE TABLE categories (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_id  uuid REFERENCES categories (id) ON DELETE SET NULL,
      name       text NOT NULL,
      slug       text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      is_active  boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`CREATE UNIQUE INDEX categories_slug_key ON categories (slug)`.execute(db)
  await sql`CREATE INDEX categories_parent_idx ON categories (parent_id)`.execute(db)

  await sql`
    CREATE TABLE brands (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name       text NOT NULL,
      slug       text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`CREATE UNIQUE INDEX brands_slug_key ON brands (slug)`.execute(db)

  /**
   * Global product definition. Deliberately holds NO price — price belongs to
   * store_products, because the same SKU costs different amounts at different
   * dark stores.
   *
   * `unit_label` ("500 g", "1 L", "pack of 6") is display text. Quick commerce
   * sells packaged goods, so quantity is always integral units of a pack; there
   * is no need for fractional quantities anywhere in this schema.
   */
  await sql`
    CREATE TABLE products (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sku         text NOT NULL,
      name        text NOT NULL,
      slug        text NOT NULL,
      description text,
      brand_id    uuid REFERENCES brands (id) ON DELETE SET NULL,
      category_id uuid REFERENCES categories (id) ON DELETE SET NULL,
      unit_label  text NOT NULL,
      image_url   text,
      is_active   boolean NOT NULL DEFAULT true,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`CREATE UNIQUE INDEX products_sku_key ON products (sku)`.execute(db)
  await sql`CREATE UNIQUE INDEX products_slug_key ON products (slug)`.execute(db)
  await sql`CREATE INDEX products_category_idx ON products (category_id) WHERE is_active`.execute(db)
  await sql`CREATE INDEX products_brand_idx ON products (brand_id) WHERE is_active`.execute(db)

  // Full-text search over name + description. Phase 1 uses this; Elasticsearch
  // only earns its place once you can show Postgres FTS is the bottleneck.
  await sql`
    CREATE INDEX products_search_idx ON products
    USING gin (to_tsvector('english', name || ' ' || coalesce(description, '')))
  `.execute(db)

  /**
   * Per-store listing and pricing.
   *
   * MONEY IS AN INTEGER COUNT OF PAISE. Never a float — 0.1 + 0.2 is not 0.3 in
   * binary floating point, and money that does not add up is the one bug
   * nobody forgives. `integer` caps a single line at ~₹21.4 million, which is
   * far beyond any grocery basket; order-level totals below use bigint.
   */
  await sql`
    CREATE TABLE store_products (
      store_id    uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
      product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
      price_paise integer NOT NULL,
      mrp_paise   integer NOT NULL,
      is_listed   boolean NOT NULL DEFAULT true,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (store_id, product_id),
      CONSTRAINT store_products_price_positive CHECK (price_paise > 0),
      CONSTRAINT store_products_mrp_gte_price CHECK (mrp_paise >= price_paise)
    )
  `.execute(db)

  // Browsing is always "what does THIS store sell", so store_id leads the index.
  await sql`
    CREATE INDEX store_products_listing_idx ON store_products (store_id, product_id)
    WHERE is_listed
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS store_products`.execute(db)
  await sql`DROP TABLE IF EXISTS products`.execute(db)
  await sql`DROP TABLE IF EXISTS brands`.execute(db)
  await sql`DROP TABLE IF EXISTS categories`.execute(db)
  await sql`DROP TABLE IF EXISTS stores`.execute(db)
}

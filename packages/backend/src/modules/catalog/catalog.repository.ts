import { db } from '../../platform/db/index.js'
import type { ProductListInput } from './catalog.schema.js'

/**
 * Catalogue reads.
 *
 * The shape of every query here: products JOIN store_products JOIN inventory,
 * all filtered by store_id. That three-way join IS the hyperlocal model —
 * what the thing is, what it costs here, how many are on this shelf.
 */

export async function findProductById(storeId: string, productId: string) {
  return db
    .selectFrom('products as p')
    .innerJoin('store_products as sp', (join) =>
      join.onRef('sp.product_id', '=', 'p.id').on('sp.store_id', '=', storeId),
    )
    .leftJoin('inventory as i', (join) =>
      join.onRef('i.product_id', '=', 'p.id').on('i.store_id', '=', storeId),
    )
    .leftJoin('brands as b', 'b.id', 'p.brand_id')
    .leftJoin('categories as c', 'c.id', 'p.category_id')
    .select((eb) => [
      'p.id',
      'p.name',
      'p.slug',
      'p.description',
      'p.unit_label',
      'p.image_url',
      'b.name as brand',
      'c.name as category',
      'sp.price_paise',
      'sp.mrp_paise',
      // available is derived, never stored. coalesce because a product can be
      // listed at a store that has no inventory row yet.
      eb.fn
        .coalesce(
          eb(eb.ref('i.quantity'), '-', eb.ref('i.reserved')),
          eb.lit(0),
        )
        .as('available_qty'),
    ])
    .where('p.id', '=', productId)
    .where('p.is_active', '=', true)
    .where('sp.is_listed', '=', true)
    .executeTakeFirst()
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YOURS TO WRITE — cursor-paginated product listing.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Start from findProductById above; the joins are identical. What you add:
 *
 *  1. FILTERS — categoryId, brandId, and full-text `q`. For search, match the
 *     GIN index created in migration 0002 exactly:
 *
 *       to_tsvector('english', name || ' ' || coalesce(description, ''))
 *         @@ plainto_tsquery('english', $1)
 *
 *     Any deviation from that expression and Postgres cannot use the index —
 *     confirm with EXPLAIN ANALYZE that you get a Bitmap Index Scan, not a Seq
 *     Scan. Checking that is the whole lesson.
 *
 *  2. CURSOR — the tricky part. The cursor must encode the FULL sort key, and
 *     the sort must be unique, or rows get skipped or duplicated at page
 *     boundaries. Sorting by price alone is not unique (many products share a
 *     price), so sort by (price, id) and compare as a tuple:
 *
 *       WHERE (sp.price_paise, p.id) > ($cursorPrice, $cursorId)
 *       ORDER BY sp.price_paise, p.id
 *
 *     Postgres compares row constructors left-to-right, which is exactly the
 *     semantics you want and is index-friendly.
 *
 *  3. NEXT CURSOR — fetch `limit + 1` rows. If you get the extra one, there is
 *     another page: drop it and encode a cursor from the last kept row. This
 *     avoids a second COUNT query, which on a large table costs as much as the
 *     page itself.
 *
 * Ask me to walk through the cursor encoding if the tuple comparison is unclear.
 */
export async function listProducts(input: ProductListInput) {
  throw new Error('Not implemented: listProducts')
}

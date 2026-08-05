import { NotFoundError } from '../../platform/errors/index.js'
import * as catalogRepository from './catalog.repository.js'
import type { ProductListInput, ProductListOutput } from './catalog.schema.js'

export async function getProduct(storeId: string, productId: string) {
  const row = await catalogRepository.findProductById(storeId, productId)

  if (!row) {
    throw new NotFoundError('Product not available at this store')
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    unitLabel: row.unit_label,
    imageUrl: row.image_url,
    brand: row.brand,
    category: row.category,
    pricePaise: row.price_paise,
    mrpPaise: row.mrp_paise,
    availableQty: Number(row.available_qty),
    inStock: Number(row.available_qty) > 0,
  }
}

/**
 * TODO — thin once the repository is done: call listProducts, map rows to
 * ProductCard, pass the cursor through.
 *
 * This is also the first endpoint you will cache in Phase 4. Worth thinking
 * about now: the cache key must include EVERY input that changes the result
 * (storeId, category, brand, q, sort, cursor, limit) or you will serve one
 * store's catalogue to another — the classic cache-poisoning bug. And
 * availability changes on every order, so either keep the TTL short or exclude
 * stock from the cached payload and fetch it separately.
 */
export async function listProducts(input: ProductListInput): Promise<ProductListOutput> {
  throw new Error('Not implemented: listProducts')
}

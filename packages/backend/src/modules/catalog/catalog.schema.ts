import { z } from '@hono/zod-openapi'

import { CursorQuery, paginated } from '../../platform/http/schemas.js'

/**
 * Every catalogue read is scoped to a store. There is deliberately no endpoint
 * that returns "all products" with a price — price and availability only exist
 * in the context of a dark store, and an API that pretends otherwise will be
 * misused by the first client that touches it.
 */
export const ProductListQuery = CursorQuery.extend({
  storeId: z.uuid(),
  categoryId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  /** Full-text search against the GIN index on name + description. */
  q: z.string().min(1).max(100).optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'name']).default('relevance'),
}).openapi('ProductListQuery')

export const ProductCard = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    unitLabel: z.string(),
    imageUrl: z.string().nullable(),
    brand: z.string().nullable(),
    /** Paise. The client formats; the API never sends pre-formatted money. */
    pricePaise: z.number().int(),
    mrpPaise: z.number().int(),
    /** quantity - reserved, computed per store. Never stored. */
    availableQty: z.number().int(),
    inStock: z.boolean(),
  })
  .openapi('ProductCard')

export const ProductDetail = ProductCard.extend({
  description: z.string().nullable(),
  category: z.string().nullable(),
}).openapi('ProductDetail')

/**
 * Declared once and shared by the route definition and the service's return
 * type. Building it inline in both places creates two structurally-identical
 * but separately-inferred types, and TypeScript will eventually find a way to
 * disagree with itself about them.
 */
export const ProductListResponse = paginated(ProductCard)

export type ProductListInput = z.infer<typeof ProductListQuery>
export type ProductListOutput = z.infer<typeof ProductListResponse>
export type ProductCardOutput = z.infer<typeof ProductCard>

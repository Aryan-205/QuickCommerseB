import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'

import type { AppBindings } from '../../platform/http/context.js'
import { jsonError } from '../../platform/http/schemas.js'
import { ProductDetail, ProductListQuery, ProductListResponse } from './catalog.schema.js'
import * as catalogService from './catalog.service.js'

export const catalogController = new OpenAPIHono<AppBindings>()

const listRoute = createRoute({
  method: 'get',
  path: '/products',
  tags: ['Catalog'],
  summary: 'Browse a store catalogue',
  request: { query: ProductListQuery },
  responses: {
    200: {
      content: { 'application/json': { schema: ProductListResponse } },
      description: 'A page of products',
    },
    422: jsonError('Invalid query'),
  },
})

const detailRoute = createRoute({
  method: 'get',
  path: '/products/{productId}',
  tags: ['Catalog'],
  summary: 'Product detail at a store',
  request: {
    params: z.object({ productId: z.uuid() }),
    query: z.object({ storeId: z.uuid() }),
  },
  responses: {
    200: { content: { 'application/json': { schema: ProductDetail } }, description: 'Product' },
    404: jsonError('Not listed at this store'),
  },
})

catalogController.openapi(listRoute, async (c) => {
  const query = c.req.valid('query')
  return c.json(await catalogService.listProducts(query), 200)
})

catalogController.openapi(detailRoute, async (c) => {
  const { productId } = c.req.valid('param')
  const { storeId } = c.req.valid('query')
  return c.json(await catalogService.getProduct(storeId, productId), 200)
})

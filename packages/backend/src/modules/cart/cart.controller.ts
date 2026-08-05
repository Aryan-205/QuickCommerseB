import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'

import { getAuthUser, requireAuth } from '../../platform/http/auth.js'
import type { AppBindings } from '../../platform/http/context.js'
import { jsonError } from '../../platform/http/schemas.js'
import { AddItemBody, ApplyCouponBody, CartView, UpdateItemBody } from './cart.schema.js'
import * as cartService from './cart.service.js'

export const cartController = new OpenAPIHono<AppBindings>()

// Every cart route is authenticated. Guest carts would need a device-scoped
// token and a merge-on-login flow — a real feature, deliberately out of scope.
const secured = { security: [{ bearerAuth: [] }], middleware: [requireAuth] }

const getCartRoute = createRoute({
  ...secured,
  method: 'get',
  path: '/cart',
  tags: ['Cart'],
  summary: 'Current cart for a store',
  request: { query: z.object({ storeId: z.uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: CartView } }, description: 'Cart' },
    401: jsonError('Not authenticated'),
  },
})

const addItemRoute = createRoute({
  ...secured,
  method: 'post',
  path: '/cart/items',
  tags: ['Cart'],
  summary: 'Add an item',
  request: { body: { content: { 'application/json': { schema: AddItemBody } }, required: true } },
  responses: {
    200: { content: { 'application/json': { schema: CartView } }, description: 'Updated cart' },
    404: jsonError('Product not listed at this store'),
  },
})

const updateItemRoute = createRoute({
  ...secured,
  method: 'patch',
  path: '/cart/{cartId}/items/{productId}',
  tags: ['Cart'],
  summary: 'Change quantity (0 removes)',
  request: {
    params: z.object({ cartId: z.uuid(), productId: z.uuid() }),
    body: { content: { 'application/json': { schema: UpdateItemBody } }, required: true },
  },
  responses: {
    200: { content: { 'application/json': { schema: CartView } }, description: 'Updated cart' },
    404: jsonError('Cart or line not found'),
  },
})

const applyCouponRoute = createRoute({
  ...secured,
  method: 'post',
  path: '/cart/{cartId}/coupon',
  tags: ['Cart'],
  summary: 'Apply a coupon',
  request: {
    params: z.object({ cartId: z.uuid() }),
    body: { content: { 'application/json': { schema: ApplyCouponBody } }, required: true },
  },
  responses: {
    200: { content: { 'application/json': { schema: CartView } }, description: 'Updated cart' },
    422: jsonError('Coupon not applicable'),
  },
})

cartController.openapi(getCartRoute, async (c) => {
  const user = getAuthUser(c)
  const { storeId } = c.req.valid('query')
  return c.json(await cartService.getCart(user.id, storeId), 200)
})

cartController.openapi(addItemRoute, async (c) => {
  const user = getAuthUser(c)
  return c.json(await cartService.addItem(user.id, c.req.valid('json')), 200)
})

cartController.openapi(updateItemRoute, async (c) => {
  const user = getAuthUser(c)
  const { cartId, productId } = c.req.valid('param')
  const { quantity } = c.req.valid('json')
  return c.json(await cartService.updateItem(user.id, cartId, productId, quantity), 200)
})

cartController.openapi(applyCouponRoute, async (c) => {
  const user = getAuthUser(c)
  const { cartId } = c.req.valid('param')
  const { code } = c.req.valid('json')
  return c.json(await cartService.applyCoupon(user.id, cartId, code), 200)
})

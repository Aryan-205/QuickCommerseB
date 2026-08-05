import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'

import { getAuthUser, requireAuth } from '../../platform/http/auth.js'
import type { AppBindings } from '../../platform/http/context.js'
import { jsonError } from '../../platform/http/schemas.js'
import {
  CancelBody,
  CheckoutBody,
  OrderListQuery,
  OrderListResponse,
  OrderView,
} from './orders.schema.js'
import * as ordersService from './orders.service.js'

export const ordersController = new OpenAPIHono<AppBindings>()

const secured = { security: [{ bearerAuth: [] }], middleware: [requireAuth] }

const checkoutRoute = createRoute({
  ...secured,
  method: 'post',
  path: '/orders/checkout',
  tags: ['Orders'],
  summary: 'Convert a cart into an order',
  description:
    'Reserves stock, snapshots prices, and attempts payment. Send an Idempotency-Key header — retries with the same key must not create a second order.',
  request: {
    // Declared now, enforced in Phase 4. Documenting it early means clients are
    // already sending it by the time the middleware starts honouring it.
    headers: z.object({
      'idempotency-key': z.uuid().optional().openapi({
        description: 'Client-generated UUID. Retries with the same key return the original order.',
      }),
    }),
    body: { content: { 'application/json': { schema: CheckoutBody } }, required: true },
  },
  responses: {
    201: { content: { 'application/json': { schema: OrderView } }, description: 'Order placed' },
    409: jsonError('Insufficient stock, or the cart is no longer active'),
    422: jsonError('Cart empty or address not serviceable'),
  },
})

const listRoute = createRoute({
  ...secured,
  method: 'get',
  path: '/orders',
  tags: ['Orders'],
  summary: 'Order history',
  request: { query: OrderListQuery },
  responses: {
    200: {
      content: { 'application/json': { schema: OrderListResponse } },
      description: 'A page of orders',
    },
  },
})

const detailRoute = createRoute({
  ...secured,
  method: 'get',
  path: '/orders/{orderId}',
  tags: ['Orders'],
  summary: 'Order detail',
  request: { params: z.object({ orderId: z.uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: OrderView } }, description: 'Order' },
    404: jsonError('No such order for this user'),
  },
})

const cancelRoute = createRoute({
  ...secured,
  method: 'post',
  path: '/orders/{orderId}/cancel',
  tags: ['Orders'],
  summary: 'Cancel an order',
  request: {
    params: z.object({ orderId: z.uuid() }),
    body: { content: { 'application/json': { schema: CancelBody } }, required: false },
  },
  responses: {
    200: { content: { 'application/json': { schema: OrderView } }, description: 'Cancelled' },
    409: jsonError('Order is too far along to cancel'),
  },
})

ordersController.openapi(checkoutRoute, async (c) => {
  const user = getAuthUser(c)
  const order = await ordersService.checkout(user.id, c.req.valid('json'))
  return c.json(order, 201)
})

ordersController.openapi(listRoute, async (c) => {
  const user = getAuthUser(c)
  const { cursor, limit } = c.req.valid('query')
  return c.json(await ordersService.listOrders(user.id, cursor, limit), 200)
})

ordersController.openapi(detailRoute, async (c) => {
  const user = getAuthUser(c)
  const { orderId } = c.req.valid('param')
  return c.json(await ordersService.getOrder(user.id, orderId), 200)
})

ordersController.openapi(cancelRoute, async (c) => {
  const user = getAuthUser(c)
  const { orderId } = c.req.valid('param')
  const body = c.req.valid('json')
  return c.json(await ordersService.cancelOrder(user.id, orderId, body?.reason), 200)
})

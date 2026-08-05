import { z } from '@hono/zod-openapi'

import { CursorQuery, paginated } from '../../platform/http/schemas.js'

export const CheckoutBody = z
  .object({
    cartId: z.uuid(),
    addressId: z.uuid(),
  })
  .openapi('CheckoutBody')

export const OrderStatusEnum = z.enum([
  'pending_payment',
  'reserved',
  'paid',
  'packed',
  'assigned',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'failed',
])

export const OrderLine = z
  .object({
    productId: z.uuid(),
    // Snapshotted at checkout, not joined live — a receipt must survive the
    // product being renamed, repriced, or delisted.
    name: z.string(),
    unitLabel: z.string(),
    quantity: z.number().int(),
    unitPricePaise: z.number().int(),
    lineTotalPaise: z.number().int(),
  })
  .openapi('OrderLine')

export const OrderView = z
  .object({
    id: z.uuid(),
    orderNumber: z.string(),
    status: OrderStatusEnum,
    storeId: z.uuid(),
    lines: z.array(OrderLine),
    subtotalPaise: z.number().int(),
    discountPaise: z.number().int(),
    deliveryFeePaise: z.number().int(),
    totalPaise: z.number().int(),
    deliveryAddress: z.object({
      line1: z.string(),
      line2: z.string().nullable(),
      city: z.string(),
      state: z.string(),
      pincode: z.string(),
    }),
    placedAt: z.iso.datetime(),
    etaMinutes: z.number().int().nullable(),
  })
  .openapi('OrderView')

export const OrderListQuery = CursorQuery.extend({
  status: OrderStatusEnum.optional(),
}).openapi('OrderListQuery')

export const CancelBody = z
  .object({ reason: z.string().max(200).optional() })
  .openapi('CancelBody')

export const OrderListResponse = paginated(OrderView)

export type CheckoutInput = z.infer<typeof CheckoutBody>
export type OrderViewOutput = z.infer<typeof OrderView>
export type OrderListOutput = z.infer<typeof OrderListResponse>

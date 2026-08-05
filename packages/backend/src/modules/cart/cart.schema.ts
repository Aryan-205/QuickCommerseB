import { z } from '@hono/zod-openapi'

export const AddItemBody = z
  .object({
    storeId: z.uuid(),
    productId: z.uuid(),
    quantity: z.number().int().min(1).max(50),
  })
  .openapi('AddItemBody')

export const UpdateItemBody = z
  .object({
    // 0 means remove. Saves a separate DELETE endpoint and makes the client's
    // quantity-stepper a single call at every step.
    quantity: z.number().int().min(0).max(50),
  })
  .openapi('UpdateItemBody')

export const CartLine = z
  .object({
    productId: z.uuid(),
    name: z.string(),
    unitLabel: z.string(),
    imageUrl: z.string().nullable(),
    quantity: z.number().int(),
    unitPricePaise: z.number().int(),
    lineTotalPaise: z.number().int(),
    availableQty: z.number().int(),
    /** True when the cart holds more than the shelf does. */
    exceedsStock: z.boolean(),
  })
  .openapi('CartLine')

export const CartView = z
  .object({
    id: z.uuid(),
    storeId: z.uuid(),
    lines: z.array(CartLine),
    subtotalPaise: z.number().int(),
    discountPaise: z.number().int(),
    deliveryFeePaise: z.number().int(),
    totalPaise: z.number().int(),
    appliedCoupon: z.string().nullable(),
    /** Blocks checkout when any line exceeds stock. */
    checkoutable: z.boolean(),
  })
  .openapi('CartView')

export const ApplyCouponBody = z.object({ code: z.string().min(3).max(32) }).openapi('ApplyCouponBody')

export type AddItemInput = z.infer<typeof AddItemBody>
export type CartViewOutput = z.infer<typeof CartView>

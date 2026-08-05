import type { AddItemInput, CartViewOutput } from './cart.schema.js'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YOURS TO WRITE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The cart is where a lot of subtle product decisions live. Make them
 * deliberately and write them down — this is exactly the kind of thing an
 * interviewer will dig into.
 *
 * Decisions to settle before you write code:
 *
 *  1. A cart is scoped to a store (see migration 0004). What happens when the
 *     user changes their delivery address and a DIFFERENT store now serves
 *     them? Options: keep separate carts per store, migrate items that the new
 *     store also lists and warn about the rest, or clear it. Every real app
 *     picks one and it is always visible to users.
 *
 *  2. The cart stores NO price — pricing is resolved live at read time, so the
 *     user always sees current prices. Consequence: the total can change
 *     between viewing the cart and checking out. Where do you freeze it?
 *
 *  3. Adding to cart does NOT reserve stock. Holding stock the moment someone
 *     shows interest would let one person empty a store's availability for
 *     free. Reservation happens at checkout. So the cart can contain more than
 *     is available — hence `exceedsStock` on each line.
 *
 * Totals: compute in integer paise, in the order
 *   subtotal -> discount -> delivery fee -> total
 * and never let floats near it.
 */

export async function getCart(userId: string, storeId: string): Promise<CartViewOutput> {
  throw new Error('Not implemented: getCart')
}

/**
 * TODO — upsert. `INSERT ... ON CONFLICT (cart_id, product_id) DO UPDATE`,
 * which the composite primary key from migration 0004 makes possible.
 *
 * Doing it as SELECT-then-INSERT-or-UPDATE is the same read-modify-write race
 * as the inventory one: double-tapping "add" creates two rows, or one insert
 * fails on the constraint. ON CONFLICT is a single atomic statement.
 */
export async function addItem(userId: string, input: AddItemInput): Promise<CartViewOutput> {
  throw new Error('Not implemented: addItem')
}

/** TODO — quantity 0 removes the line. */
export async function updateItem(
  userId: string,
  cartId: string,
  productId: string,
  quantity: number,
): Promise<CartViewOutput> {
  throw new Error('Not implemented: updateItem')
}

/**
 * TODO — validate and attach a coupon.
 *
 * Validate: active, within its window, subtotal meets min_order_paise, usage
 * limit not exhausted, per-user limit not exceeded. Apply the cap for percent
 * coupons (max_discount_paise) and never let a discount exceed the subtotal —
 * a negative total is a refund you did not intend to issue.
 *
 * Note where `used_count` gets incremented: at checkout, not here. Otherwise
 * browsing coupons burns them.
 */
export async function applyCoupon(
  userId: string,
  cartId: string,
  code: string,
): Promise<CartViewOutput> {
  throw new Error('Not implemented: applyCoupon')
}

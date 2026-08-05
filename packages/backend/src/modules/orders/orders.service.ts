import type { OrderStatus } from '../../platform/db/types.js'
import type { CheckoutInput, OrderListOutput, OrderViewOutput } from './orders.schema.js'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YOURS TO WRITE — checkout is the hardest flow in the project.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It touches cart, inventory, coupons, orders, and payments, and every one of
 * them can fail independently. Sequence it deliberately:
 *
 *   1. Load the cart, verify it belongs to this user and is still `active`.
 *   2. Re-price everything from store_products. NEVER trust a total the client
 *      sends, and never trust one you computed a minute ago — prices change.
 *   3. Reserve stock (inventory.reserve). Fails -> 409, nothing else happened.
 *   4. Create the order + order_items + the initial status-history row, with
 *      prices SNAPSHOTTED, in one transaction.
 *   5. Mark the cart `converted`.
 *   6. Charge payment.
 *   7. On success: commit reservations, transition to `paid`.
 *      On failure: release reservations, transition to `failed`.
 *
 * ── The problem you cannot fully solve yet ────────────────────────────────
 *
 * Step 6 talks to an external system; steps 4-7 talk to your database. There is
 * no shared transaction across the two. So:
 *
 *   payment succeeds -> your process crashes -> order stays `reserved` forever,
 *   the customer has been charged, and the stock is still only held.
 *
 * You cannot make this impossible; you can only make it RECOVERABLE. That is
 * what Phase 6's outbox pattern is for, and it is why the outbox exists at all.
 * For now, write the naive version AND write down precisely where it breaks.
 * That paragraph is the setup for your best ADR.
 *
 * ── Idempotency (Phase 4) ─────────────────────────────────────────────────
 *
 * Users double-tap. Networks retry. Without an Idempotency-Key this creates two
 * orders and two charges. Design for it now even if you implement it later:
 * checkout should be safe to call twice with the same key.
 */

export async function checkout(userId: string, input: CheckoutInput): Promise<OrderViewOutput> {
  throw new Error('Not implemented: checkout')
}

export async function getOrder(userId: string, orderId: string): Promise<OrderViewOutput> {
  /**
   * TODO — and note the authorization check: an order belongs to a user, so
   * fetching someone else's must 404, not 403.
   *
   * 403 confirms the resource exists, which leaks whether a given order ID is
   * real. For resources the caller has no business knowing about, 404 is the
   * right lie. (Contrast with /auth/me, where 403 is correct — the caller knows
   * the resource exists, they simply lack the role.)
   */
  throw new Error('Not implemented: getOrder')
}

/** TODO — cursor-paginated, newest first. Index `orders_user_recent_idx` exists for exactly this. */
export async function listOrders(
  userId: string,
  cursor?: string,
  limit = 20,
): Promise<OrderListOutput> {
  throw new Error('Not implemented: listOrders')
}

/**
 * TODO — cancellation.
 *
 * Use assertTransition from ./order-state-machine.js rather than hand-rolling
 * the rules. Then: release or refund depending on where the order got to
 * (requiresStockRelease tells you which), write the history row in the same
 * transaction, and set cancelled_at plus the reason.
 */
export async function cancelOrder(
  userId: string,
  orderId: string,
  reason?: string,
): Promise<OrderViewOutput> {
  throw new Error('Not implemented: cancelOrder')
}

/**
 * TODO — the single funnel every status change goes through (admin actions,
 * pickers, riders, background jobs).
 *
 * One function, so the "validate transition + update + append history, all in
 * one transaction" rule is written once and cannot be forgotten.
 */
export async function transitionStatus(
  orderId: string,
  to: OrderStatus,
  actor: string,
  reason?: string,
): Promise<void> {
  throw new Error('Not implemented: transitionStatus')
}

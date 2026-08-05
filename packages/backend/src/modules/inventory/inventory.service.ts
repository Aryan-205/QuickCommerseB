import * as inventoryRepository from './inventory.repository.js'

export interface ReservationRequest {
  storeId: string
  items: ReadonlyArray<{ productId: string; quantity: number }>
}

export async function getAvailability(storeId: string, productIds: readonly string[]) {
  const rows = await inventoryRepository.getAvailability(storeId, productIds)

  return rows.map((row) => ({
    productId: row.product_id,
    available: Number(row.available),
    inStock: Number(row.available) > 0,
  }))
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YOURS TO WRITE — all-or-nothing multi-item reservation.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A cart is several products. Either the whole basket is held or none of it is
 * — partially reserving a basket leaves stock locked for an order that can
 * never be completed.
 *
 * Sketch:
 *
 *   return db.transaction().execute(async (trx) => {
 *     // Deterministic order matters. Two carts holding the same two products
 *     // in opposite orders will deadlock. Sorting by productId gives every
 *     // transaction the same lock order, which makes deadlock impossible.
 *     const items = [...request.items].sort((a, b) =>
 *       a.productId < b.productId ? -1 : 1)
 *
 *     for (const item of items) {
 *       const result = await inventoryRepository.reserveStock(
 *         request.storeId, item.productId, item.quantity, trx)
 *
 *       // Throwing rolls the transaction back, which releases every hold taken
 *       // so far in it. That is the atomicity you want, for free.
 *       if (!result) throw new InsufficientStockError(item.productId, item.quantity, 0)
 *     }
 *
 *     // Then: insert `reservations` rows with expires_at = now + TTL,
 *     // and write to inventory_ledger in this SAME transaction.
 *   })
 *
 * Read the hold duration from `env.RESERVATION_TTL_SECONDS` (default 900).
 * Decide and document what it should be: too short and users lose their basket
 * mid-payment; too long and abandoned carts starve real buyers. What is right
 * for 10-minute grocery delivery, and why?
 */
export async function reserve(request: ReservationRequest): Promise<{ reservationIds: string[] }> {
  throw new Error('Not implemented: reserve')
}

/**
 * TODO — release every hold for an order (cancellation, payment failure).
 * Idempotent: this will be retried.
 */
export async function releaseForOrder(orderId: string): Promise<void> {
  throw new Error('Not implemented: releaseForOrder')
}

/**
 * TODO — turn holds into real stock decrements once payment succeeds.
 */
export async function commitForOrder(orderId: string): Promise<void> {
  throw new Error('Not implemented: commitForOrder')
}

/**
 * TODO — the sweeper. Finds `held` reservations past expires_at, releases the
 * stock, marks them `expired`.
 *
 * Runs from a BullMQ repeatable job in Phase 5; until then you can call it
 * manually. Two things to get right:
 *
 *  - Batch it (LIMIT a few hundred per run). A single UPDATE over a day's worth
 *    of expired rows takes a long lock and stalls live checkouts.
 *  - Make it safe to run concurrently with itself. Two workers picking up the
 *    same expired reservation must not release the stock twice — `FOR UPDATE
 *    SKIP LOCKED` is the standard tool here, and it is worth learning now
 *    because it is also how you would build a job queue on Postgres.
 */
export async function sweepExpiredReservations(batchSize = 200): Promise<number> {
  throw new Error('Not implemented: sweepExpiredReservations')
}

import type { Kysely } from 'kysely'

import { db } from '../../platform/db/index.js'
import type { DB } from '../../platform/db/types.js'

type Executor = Kysely<DB>

export async function getAvailability(storeId: string, productIds: readonly string[]) {
  if (productIds.length === 0) return []

  return db
    .selectFrom('inventory')
    .select((eb) => [
      'product_id',
      'quantity',
      'reserved',
      eb(eb.ref('quantity'), '-', eb.ref('reserved')).as('available'),
    ])
    .where('store_id', '=', storeId)
    .where('product_id', 'in', productIds)
    .execute()
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YOURS TO WRITE — the single most important function in this project.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Reserve `quantity` units of one product at one store, or fail.
 *
 * Return something the caller can branch on (a boolean, or the updated row /
 * undefined). Do NOT throw from here — the service decides what a failure means
 * in domain terms.
 *
 * ── Approach 1: the one everybody writes first, and it is wrong ────────────
 *
 *     const row = await SELECT quantity, reserved WHERE ...
 *     if (row.quantity - row.reserved >= qty)
 *       await UPDATE inventory SET reserved = reserved + qty WHERE ...
 *
 *   Stock is 1. Two requests arrive together:
 *
 *     T1  SELECT -> available = 1
 *     T2  SELECT -> available = 1        (T1 has not written yet)
 *     T1  UPDATE -> reserved = 1
 *     T2  UPDATE -> reserved = 2         (checked a value that is now stale)
 *
 *   Both customers are promised the same unit. This is a read-modify-write
 *   race, and it is invisible in testing because you have to hit the exact
 *   interleaving. In production, at 200 req/s on a flash-sale SKU, you hit it
 *   constantly.
 *
 *   Note the CHECK constraint from migration 0003 catches this — the second
 *   UPDATE violates reserved <= quantity and the transaction aborts. That is
 *   the safety net doing its job, not a substitute for correct logic.
 *
 * ── Approach 2: SELECT ... FOR UPDATE ─────────────────────────────────────
 *
 *   Take a row lock inside a transaction, so the second reader BLOCKS until the
 *   first commits and then re-reads the true value.
 *
 *     await db.transaction().execute(async (trx) => {
 *       const row = await trx.selectFrom('inventory')
 *         .selectAll()
 *         .where(...)
 *         .forUpdate()          // <- the lock
 *         .executeTakeFirst()
 *       ...
 *     })
 *
 *   Correct. The cost: every buyer of a hot SKU serialises behind one lock.
 *   Under a flash sale that turns concurrency into a queue, and if anything
 *   slow happens inside the transaction, the queue becomes a timeout pile-up.
 *   Also introduces deadlock risk once you lock MULTIPLE products in one
 *   checkout — two carts locking the same two products in opposite orders
 *   deadlock. Fix: always lock in a deterministic order (sort by product_id).
 *
 * ── Approach 3: one conditional UPDATE ────────────────────────────────────
 *
 *   Push the check INTO the write. A single statement is atomic; no window
 *   exists between test and set.
 *
 *     UPDATE inventory
 *        SET reserved = reserved + $qty, updated_at = now()
 *      WHERE store_id = $1 AND product_id = $2
 *        AND quantity - reserved >= $qty
 *     RETURNING *;
 *
 *   Zero rows returned means insufficient stock. Correct AND non-blocking:
 *   concurrent reservations of DIFFERENT products never interact, and
 *   concurrent reservations of the same product take only the brief row lock
 *   the UPDATE itself needs.
 *
 *   In Kysely: `.updateTable(...).set(...).where(...).returningAll()
 *              .executeTakeFirst()` — and build the `quantity - reserved >= qty`
 *   predicate with the expression builder.
 *
 * ── What to actually do ───────────────────────────────────────────────────
 *
 *   Implement approach 3. Then implement approach 1 as well, behind a flag or
 *   in a scratch branch, and write the concurrency test that PROVES approach 1
 *   oversells and approach 3 does not. That test and its output are the
 *   centrepiece of your inventory ADR — a demonstrated race is worth far more
 *   than a paragraph claiming you understand one.
 *
 *   Then think about the multi-item case: a cart has several products, and the
 *   reservation must be all-or-nothing. One transaction, several conditional
 *   updates, roll back the whole thing if any returns zero rows.
 */
export async function reserveStock(
  storeId: string,
  productId: string,
  quantity: number,
  trx: Executor = db,
): Promise<{ reserved: number } | undefined> {
  throw new Error('Not implemented: reserveStock')
}

/**
 * TODO — release a hold. `reserved = reserved - qty`, quantity untouched.
 *
 * Guard against going negative: `AND reserved >= $qty`. The CHECK constraint
 * will catch it anyway, but failing the predicate is a clean no-op whereas the
 * constraint aborts the surrounding transaction.
 *
 * Must be IDEMPOTENT. In Phase 5 this gets called from a retrying job, and in
 * Phase 6 from an at-least-once Kafka consumer — both WILL deliver twice.
 * Releasing the same reservation twice must not return stock twice. The usual
 * answer: make the reservation row's status transition the guard, and only
 * decrement when you actually moved it out of 'held'.
 */
export async function releaseStock(
  storeId: string,
  productId: string,
  quantity: number,
  trx: Executor = db,
): Promise<void> {
  throw new Error('Not implemented: releaseStock')
}

/**
 * TODO — a hold becomes a real decrement once payment succeeds:
 *   quantity -= qty  AND  reserved -= qty
 *
 * Both in one statement. Doing them as two updates leaves a window where the
 * numbers are inconsistent and any concurrent reader sees a lie.
 */
export async function commitReservation(
  storeId: string,
  productId: string,
  quantity: number,
  trx: Executor = db,
): Promise<void> {
  throw new Error('Not implemented: commitReservation')
}

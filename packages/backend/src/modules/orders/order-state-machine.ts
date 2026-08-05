import type { OrderStatus } from '../../platform/db/types.js'
import { InvalidStateTransitionError } from '../../platform/errors/index.js'

/**
 * The order lifecycle, as DATA rather than as scattered `if` statements.
 *
 * Why this shape matters: the alternative is transition rules smeared across
 * every handler that touches an order. Six months in, nobody can answer "can a
 * packed order be cancelled?" without reading the whole codebase — and two
 * handlers will disagree.
 *
 * As a table it is one grep, it is testable without HTTP or a database, and it
 * is directly reviewable by someone non-technical.
 *
 *   pending_payment ──> reserved ──> paid ──> packed ──> assigned
 *          │                │          │        │           │
 *          │                │          │        │           v
 *          │                │          │        │    out_for_delivery
 *          │                │          │        │           │
 *          v                v          v        v           v
 *       failed          cancelled  cancelled cancelled   delivered
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  // Stock is held, awaiting payment.
  pending_payment: ['reserved', 'failed', 'cancelled'],
  // Hold confirmed; payment in flight.
  reserved: ['paid', 'failed', 'cancelled'],
  // Money captured, holds committed to real decrements.
  paid: ['packed', 'cancelled'],
  // Picker has assembled the basket.
  packed: ['assigned', 'cancelled'],
  // A rider has accepted it.
  assigned: ['out_for_delivery', 'cancelled'],
  // Past this point cancellation is a returns problem, not an order problem.
  out_for_delivery: ['delivered', 'failed'],

  // Terminal states. An order that leaves one of these is a bug.
  delivered: [],
  cancelled: [],
  failed: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to)
}

/** Throws InvalidStateTransitionError (409) if the move is not permitted. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to)
  }
}

export function isTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0
}

/**
 * Stock is committed (really decremented) only once payment succeeds. Before
 * that it is merely held, so a cancellation just releases the hold.
 */
export function requiresStockRelease(from: OrderStatus): boolean {
  return from === 'pending_payment' || from === 'reserved'
}

/**
 * NOTE the invariant this file cannot enforce on its own: every transition must
 * write an `order_status_history` row IN THE SAME TRANSACTION as the
 * `orders.status` update. Two writes, one transaction, or your audit log
 * quietly disagrees with reality — which is worse than having no audit log,
 * because you will trust it.
 */

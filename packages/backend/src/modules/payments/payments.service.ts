/**
 * Mock payment gateway.
 *
 * Deliberately NOT Stripe. A real gateway would teach you their SDK; a fake one
 * you control lets you force the failures that actually matter — timeouts,
 * duplicate webhooks, a success you never hear about — on demand, in a test.
 * Integrate a real provider once the failure handling around it is solid.
 *
 * Model it on how real gateways behave:
 *
 *  - It is SLOW. Add 200-800ms of latency. This is what makes payment belong
 *    off the request path, and it is what your Phase 8 numbers will show.
 *  - It FAILS, around half the time here. Far higher than reality, because you
 *    want the failure path exercised constantly rather than once a month.
 *  - It can TIME OUT — the worst case, because you do not learn whether the
 *    charge went through. Your code must handle "unknown" as a third outcome,
 *    not fold it into failure.
 *  - It is not idempotent unless you make it so. Pass an idempotency key and
 *    have the mock honour it.
 */

export type PaymentOutcome =
  | { status: 'succeeded'; providerRef: string }
  | { status: 'failed'; failureCode: string }
  /**
   * The one people forget. A timeout means the charge may or may not have
   * happened. You cannot resolve it in-request — it needs reconciliation
   * against the provider later. Model it explicitly so the type system forces
   * every caller to decide what to do.
   */
  | { status: 'unknown'; reason: string }

export interface ChargeRequest {
  orderId: string
  amountPaise: number
  idempotencyKey: string
}

/**
 * TODO — yours to write.
 *
 * Start simple: random success/failure with latency. Then add a way for tests
 * to force a specific outcome (an env flag or an injectable RNG), because a
 * randomly-failing dependency makes for a randomly-failing test suite.
 */
export async function charge(request: ChargeRequest): Promise<PaymentOutcome> {
  throw new Error('Not implemented: charge')
}

/**
 * TODO — refunds. Note refunds are themselves retryable and must be idempotent:
 * refunding twice is real money leaving.
 */
export async function refund(orderId: string, amountPaise: number): Promise<PaymentOutcome> {
  throw new Error('Not implemented: refund')
}

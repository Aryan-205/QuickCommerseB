import { describe, expect, it } from 'vitest'

import { InvalidStateTransitionError } from '../../platform/errors/index.js'
import type { OrderStatus } from '../../platform/db/types.js'
import {
  ORDER_TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminal,
} from './order-state-machine.js'

/**
 * The state machine is pure — no database, no HTTP — so it is exhaustively
 * testable in milliseconds. That is the payoff for modelling transitions as
 * data instead of scattering `if` statements through the service layer.
 */
describe('order state machine', () => {
  it('permits the happy path end to end', () => {
    const happyPath: OrderStatus[] = [
      'pending_payment',
      'reserved',
      'paid',
      'packed',
      'assigned',
      'out_for_delivery',
      'delivered',
    ]

    for (let i = 0; i < happyPath.length - 1; i++) {
      const from = happyPath[i]!
      const to = happyPath[i + 1]!
      expect(canTransition(from, to), `${from} -> ${to}`).toBe(true)
    }
  })

  it('refuses to move backwards', () => {
    expect(canTransition('paid', 'pending_payment')).toBe(false)
    expect(canTransition('delivered', 'packed')).toBe(false)
    expect(canTransition('out_for_delivery', 'paid')).toBe(false)
  })

  it('refuses to skip ahead', () => {
    expect(canTransition('pending_payment', 'delivered')).toBe(false)
    expect(canTransition('reserved', 'out_for_delivery')).toBe(false)
  })

  it('treats delivered, cancelled and failed as terminal', () => {
    expect(isTerminal('delivered')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('paid')).toBe(false)
  })

  it('cannot leave a terminal state by any route', () => {
    const terminal: OrderStatus[] = ['delivered', 'cancelled', 'failed']
    const every = Object.keys(ORDER_TRANSITIONS) as OrderStatus[]

    for (const from of terminal) {
      for (const to of every) {
        expect(canTransition(from, to), `${from} -> ${to} must be rejected`).toBe(false)
      }
    }
  })

  it('allows cancellation up to out_for_delivery, and not after', () => {
    const cancellable: OrderStatus[] = ['pending_payment', 'reserved', 'paid', 'packed', 'assigned']
    for (const from of cancellable) {
      expect(canTransition(from, 'cancelled'), `${from} should be cancellable`).toBe(true)
    }

    // Past this point it is a returns problem, not an order problem.
    expect(canTransition('out_for_delivery', 'cancelled')).toBe(false)
  })

  it('throws a 409-shaped error on an illegal transition', () => {
    expect(() => assertTransition('delivered', 'packed')).toThrow(InvalidStateTransitionError)
    expect(() => assertTransition('reserved', 'paid')).not.toThrow()
  })

  it('never lists a status as its own successor', () => {
    for (const [from, targets] of Object.entries(ORDER_TRANSITIONS)) {
      expect(targets, `${from} must not transition to itself`).not.toContain(from)
    }
  })
})

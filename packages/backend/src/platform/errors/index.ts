import type { ContentfulStatusCode } from 'hono/utils/http-status'

/**
 * Application errors.
 *
 * Two rules that keep this useful:
 *
 * 1. Every error carries a STABLE MACHINE CODE alongside its message. Clients
 *    branch on `code`; humans read `message`. Messages get reworded, translated,
 *    and A/B tested — a client that string-matches them breaks silently.
 *
 * 2. `isOperational` separates "expected, the caller did something invalid"
 *    from "a bug or a dependency failed". Operational errors are logged at warn
 *    and returned verbatim. Non-operational ones are logged at error with the
 *    stack, and the client gets a generic message — internal detail in an HTTP
 *    response is an information leak.
 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: string
  readonly details: unknown
  readonly isOperational: boolean

  constructor(
    message: string,
    status: ContentfulStatusCode,
    code: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message)
    this.name = new.target.name
    this.status = status
    this.code = code
    this.details = details
    this.isOperational = isOperational
    Error.captureStackTrace?.(this, new.target)
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', details)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: unknown) {
    super(message, 401, 'UNAUTHORIZED', details)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(message, 404, 'NOT_FOUND', details)
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict with current state', details?: unknown) {
    super(message, 409, 'CONFLICT', details)
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 422, 'VALIDATION_FAILED', details)
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Rate limit exceeded', details?: unknown) {
    super(message, 429, 'RATE_LIMITED', details)
  }
}

// ─── domain errors ─────────────────────────────────────────────────────────

/**
 * 409, not 400. The request was well-formed; the world changed underneath it.
 * Clients should be able to distinguish "you sent nonsense" from "someone beat
 * you to the last unit" — the second is retryable, the first is not.
 */
export class InsufficientStockError extends AppError {
  constructor(productId: string, requested: number, available: number) {
    super('Insufficient stock', 409, 'INSUFFICIENT_STOCK', {
      productId,
      requested,
      available,
    })
  }
}

/** Attempted an order transition the state machine does not allow. */
export class InvalidStateTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(`Cannot transition from ${from} to ${to}`, 409, 'INVALID_STATE_TRANSITION', {
      from,
      to,
    })
  }
}

/** The delivery location is outside every active dark store's catchment. */
export class OutOfServiceAreaError extends AppError {
  constructor(lat: number, lng: number) {
    super('No store serves this location', 422, 'OUT_OF_SERVICE_AREA', { lat, lng })
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

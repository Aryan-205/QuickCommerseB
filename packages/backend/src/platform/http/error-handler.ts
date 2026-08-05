import type { ErrorHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'

import { isProduction } from '../config/env.js'
import { isAppError } from '../errors/index.js'
import type { AppBindings } from './context.js'

/**
 * Postgres error codes worth translating.
 *
 * A raw driver error reaching the client is both a bad experience and an
 * information leak — it exposes table and constraint names. Translating the
 * handful of codes that represent real user-facing conflicts keeps the API
 * honest without leaking schema.
 *
 * Full list: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PG_ERROR_MAP: Record<string, { status: 400 | 409 | 422; code: string; message: string }> = {
  // unique_violation — duplicate email, duplicate order number, replayed key
  '23505': { status: 409, code: 'ALREADY_EXISTS', message: 'Resource already exists' },
  // foreign_key_violation — referenced row is missing or still referenced
  '23503': { status: 422, code: 'INVALID_REFERENCE', message: 'Referenced resource does not exist' },
  // check_violation — e.g. inventory_reserved_within_quantity. Reaching this
  // means application logic let something through that the schema refused.
  '23514': { status: 409, code: 'CONSTRAINT_VIOLATION', message: 'Operation violates a data constraint' },
  // not_null_violation
  '23502': { status: 400, code: 'MISSING_FIELD', message: 'A required field is missing' },
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

export const errorHandler: ErrorHandler<AppBindings> = (err, c) => {
  const log = c.get('logger')
  const requestId = c.get('requestId')

  // 1. Known application errors — safe to surface as-is.
  if (isAppError(err)) {
    if (err.isOperational) {
      log.warn({ code: err.code, details: err.details }, err.message)
    } else {
      log.error({ err, code: err.code }, err.message)
    }

    return c.json(
      { error: { code: err.code, message: err.message, details: err.details, requestId } },
      err.status,
    )
  }

  // 2. Schema validation that escaped the route-level hook.
  if (err instanceof ZodError) {
    log.warn({ issues: err.issues }, 'validation failed')
    return c.json(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: err.issues,
          requestId,
        },
      },
      422,
    )
  }

  // 3. Errors thrown by Hono itself (body too large, malformed JSON, ...).
  if (err instanceof HTTPException) {
    log.warn({ status: err.status }, err.message)
    return c.json(
      { error: { code: 'HTTP_ERROR', message: err.message, requestId } },
      err.status,
    )
  }

  // 4. Driver errors we can translate without leaking schema detail.
  const pgCode = pgErrorCode(err)
  const mapped = pgCode ? PG_ERROR_MAP[pgCode] : undefined
  if (mapped) {
    log.warn({ pgCode, err }, 'database constraint rejected the operation')
    return c.json(
      { error: { code: mapped.code, message: mapped.message, requestId } },
      mapped.status,
    )
  }

  // 5. Anything else is a bug. Log everything, tell the client nothing.
  //    The requestId is the bridge: the user quotes it, you grep for it.
  log.error({ err }, 'unhandled error')

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId,
        // Stack traces are a development affordance and a production leak.
        ...(isProduction ? {} : { debug: err instanceof Error ? err.stack : String(err) }),
      },
    },
    500,
  )
}

export const notFoundHandler: NotFoundHandler<AppBindings> = (c) =>
  c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: `No route for ${c.req.method} ${c.req.path}`,
        requestId: c.get('requestId'),
      },
    },
    404,
  )

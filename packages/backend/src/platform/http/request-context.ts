import { randomUUID } from 'node:crypto'
import { createMiddleware } from 'hono/factory'

import { logger } from '../logger/index.js'
import type { AppBindings } from './context.js'

/**
 * Assigns every request an ID and a child logger bound to it.
 *
 * Why: once you have queues (Phase 5) and events (Phase 6), one user action
 * produces log lines from the API, a worker, and several consumers. Without a
 * correlation ID threaded through all of them, debugging becomes archaeology.
 *
 * The header is honoured if the caller supplies one, so a request ID created at
 * the edge (load balancer, gateway) survives into your logs instead of being
 * replaced. In Phase 7 this gets superseded by the W3C `traceparent` header and
 * real OpenTelemetry context propagation — same idea, standardised.
 */
export const requestContext = createMiddleware<AppBindings>(async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? randomUUID()

  c.set('requestId', requestId)
  c.set('logger', logger.child({ requestId }))
  c.header('x-request-id', requestId)

  await next()
})

/**
 * Access + error logging.
 *
 * Deliberately logs on the way OUT, so duration and status are known. Health
 * checks are skipped — an orchestrator polling every second would otherwise
 * drown out real traffic in your logs.
 */
export const requestLogger = createMiddleware<AppBindings>(async (c, next) => {
  const start = performance.now()

  await next()

  const path = c.req.path
  if (path === '/health' || path === '/health/live') return

  const durationMs = Math.round(performance.now() - start)
  const log = c.get('logger')
  const payload = {
    method: c.req.method,
    path,
    status: c.res.status,
    durationMs,
  }

  if (c.res.status >= 500) log.error(payload, 'request failed')
  else if (c.res.status >= 400) log.warn(payload, 'request rejected')
  else log.info(payload, 'request completed')
})

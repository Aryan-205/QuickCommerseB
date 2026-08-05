import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'

import { pingDatabase } from '../../platform/db/index.js'
import type { AppBindings } from '../../platform/http/context.js'

/**
 * Health endpoints — and the reference example for how EVERY route in this
 * codebase is written.
 *
 * The pattern is always the same three steps:
 *   1. describe the route with `createRoute` (path, method, schemas, responses)
 *   2. register it with `.openapi(route, handler)`
 *   3. the handler is fully typed from the schemas, and /docs updates itself
 *
 * Liveness and readiness are different questions and must be different
 * endpoints:
 *
 *   /health/live   "is this process alive?"        — never touches dependencies
 *   /health        "should I send it traffic?"     — checks dependencies
 *
 * Conflating them is a classic outage amplifier: if readiness is wired to the
 * liveness probe and the database blips, the orchestrator concludes every
 * instance is dead and restarts your entire fleet — turning a brief database
 * hiccup into a full outage.
 */

const HealthResponse = z
  .object({
    status: z.enum(['ok', 'degraded']),
    uptimeSeconds: z.number(),
    checks: z.object({
      database: z.enum(['up', 'down']),
    }),
  })
  .openapi('HealthResponse')

const LivenessResponse = z.object({ status: z.literal('alive') }).openapi('LivenessResponse')

const readinessRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Readiness probe',
  description: 'Reports whether this instance can serve traffic. Checks dependencies.',
  responses: {
    200: {
      content: { 'application/json': { schema: HealthResponse } },
      description: 'Instance is ready',
    },
    503: {
      content: { 'application/json': { schema: HealthResponse } },
      description: 'A dependency is unavailable',
    },
  },
})

const livenessRoute = createRoute({
  method: 'get',
  path: '/health/live',
  tags: ['Health'],
  summary: 'Liveness probe',
  description: 'Reports only that the process is running. Never checks dependencies.',
  responses: {
    200: {
      content: { 'application/json': { schema: LivenessResponse } },
      description: 'Process is alive',
    },
  },
})

export const healthController = new OpenAPIHono<AppBindings>()

healthController.openapi(readinessRoute, async (c) => {
  const databaseUp = await pingDatabase()

  const body = {
    status: databaseUp ? ('ok' as const) : ('degraded' as const),
    uptimeSeconds: Math.round(process.uptime()),
    checks: { database: databaseUp ? ('up' as const) : ('down' as const) },
  }

  // 503 is what tells a load balancer to stop routing here. Returning 200 with
  // `status: "degraded"` in the body would be ignored by every orchestrator on
  // earth — they read the status code, not your JSON.
  return c.json(body, databaseUp ? 200 : 503)
})

healthController.openapi(livenessRoute, (c) => c.json({ status: 'alive' as const }, 200))

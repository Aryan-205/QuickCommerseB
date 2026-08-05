import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

import { ValidationError } from './platform/errors/index.js'
import type { AppBindings } from './platform/http/context.js'
import { errorHandler, notFoundHandler } from './platform/http/error-handler.js'
import { requestContext, requestLogger } from './platform/http/request-context.js'
import { authController } from './modules/auth/index.js'
import { cartController } from './modules/cart/index.js'
import { catalogController } from './modules/catalog/index.js'
import { healthController } from './modules/health/health.controller.js'
import { ordersController } from './modules/orders/index.js'
import { storesController } from './modules/stores/index.js'

/**
 * Composition root. The only file that knows every module exists.
 *
 * Exported separately from the server (src/index.ts) so tests can drive the app
 * with `app.request(...)` without binding a port — which is what makes the test
 * suite fast and lets tests run in parallel.
 */
export function createApp() {
  const app = new OpenAPIHono<AppBindings>({
    /**
     * Fires whenever a zod-openapi route's schema rejects the request. Without
     * it, @hono/zod-openapi returns its own terse 400 that does not match the
     * error envelope every other endpoint uses. Routing it through our own
     * error type means ONE response shape across the whole API.
     */
    defaultHook: (result) => {
      if (!result.success) {
        throw new ValidationError('Request validation failed', result.error.issues)
      }
    },
  })

  // ── middleware (order matters) ───────────────────────────────────────────
  // requestContext first: everything downstream, including the error handler,
  // expects `requestId` and `logger` to be on the context.
  app.use('*', requestContext)
  app.use('*', requestLogger)
  app.use('*', secureHeaders())
  app.use(
    '*',
    cors({
      // Tighten before anything is deployed. '*' here is fine for local work
      // with no cookie-based auth; with credentials it is both a security hole
      // and rejected by browsers.
      origin: '*',
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
      exposeHeaders: ['X-Request-Id'],
    }),
  )

  app.onError(errorHandler)
  app.notFound(notFoundHandler)

  // ── routes ───────────────────────────────────────────────────────────────
  // Health sits at the root, unversioned: orchestrator probes should never have
  // to know or care about your API version.
  app.route('/', healthController)

  // Everything else is versioned from day one. Adding /v2 later is trivial;
  // retrofitting a version prefix onto live clients is not.
  const v1 = new OpenAPIHono<AppBindings>()
  v1.route('/', authController)
  v1.route('/', storesController)
  v1.route('/', catalogController)
  v1.route('/', cartController)
  v1.route('/', ordersController)
  app.route('/api/v1', v1)

  // ── API documentation ────────────────────────────────────────────────────
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  })

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'QuickCommerce API',
      version: '0.1.0',
      description:
        'Hyperlocal quick-commerce backend. Catalogue, pricing, and availability are always scoped to the dark store serving the delivery location.',
    },
    // No `servers` entry: the generated paths already carry the /api/v1 prefix,
    // so adding a server base of /api/v1 would make clients request
    // /api/v1/api/v1/... Paths are absolute from the server root.
  })

  // Generated from the same Zod schemas that validate requests, so it cannot
  // drift from the implementation the way hand-written docs do.
  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'QuickCommerce API' }))

  return app
}

export type App = ReturnType<typeof createApp>

import { OpenAPIHono, createRoute } from '@hono/zod-openapi'

import { getAuthUser, requireAuth } from '../../platform/http/auth.js'
import type { AppBindings } from '../../platform/http/context.js'
import { jsonError } from '../../platform/http/schemas.js'
import { AuthResponse, LoginBody, PublicUser, RefreshBody, RegisterBody } from './auth.schema.js'
import * as authService from './auth.service.js'

/**
 * Controller = HTTP only.
 *
 * Its entire job: describe the contract, pull typed values off the request,
 * call a service, shape the response. No business rules, no SQL. Keeping this
 * boundary clean is what makes the service testable without spinning up HTTP,
 * and what would make extracting this module into its own process a mechanical
 * job rather than a rewrite.
 */
export const authController = new OpenAPIHono<AppBindings>()

const registerRoute = createRoute({
  method: 'post',
  path: '/auth/register',
  tags: ['Auth'],
  summary: 'Create an account',
  request: {
    body: { content: { 'application/json': { schema: RegisterBody } }, required: true },
  },
  responses: {
    201: { content: { 'application/json': { schema: AuthResponse } }, description: 'Account created' },
    409: jsonError('Email already registered'),
    422: jsonError('Validation failed'),
  },
})

const loginRoute = createRoute({
  method: 'post',
  path: '/auth/login',
  tags: ['Auth'],
  summary: 'Exchange credentials for tokens',
  request: {
    body: { content: { 'application/json': { schema: LoginBody } }, required: true },
  },
  responses: {
    200: { content: { 'application/json': { schema: AuthResponse } }, description: 'Authenticated' },
    401: jsonError('Invalid credentials'),
  },
})

const refreshRoute = createRoute({
  method: 'post',
  path: '/auth/refresh',
  tags: ['Auth'],
  summary: 'Rotate a refresh token',
  description:
    'Returns a new token pair and invalidates the presented one. Reusing an already-rotated token revokes the entire session family.',
  request: {
    body: { content: { 'application/json': { schema: RefreshBody } }, required: true },
  },
  responses: {
    200: { content: { 'application/json': { schema: AuthResponse } }, description: 'Rotated' },
    401: jsonError('Invalid, expired, or replayed refresh token'),
  },
})

const logoutRoute = createRoute({
  method: 'post',
  path: '/auth/logout',
  tags: ['Auth'],
  summary: 'End the session',
  request: {
    body: { content: { 'application/json': { schema: RefreshBody } }, required: true },
  },
  responses: {
    204: { description: 'Session ended' },
  },
})

const meRoute = createRoute({
  method: 'get',
  path: '/auth/me',
  tags: ['Auth'],
  summary: 'Current user',
  // Declares the padlock in the docs UI and marks the route as protected in the
  // OpenAPI document. It does NOT enforce anything — `requireAuth` below does.
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  responses: {
    200: { content: { 'application/json': { schema: PublicUser } }, description: 'The caller' },
    401: jsonError('Not authenticated'),
  },
})

authController.openapi(registerRoute, async (c) => {
  const body = c.req.valid('json')
  const result = await authService.register(body)
  return c.json(result, 201)
})

authController.openapi(loginRoute, async (c) => {
  const body = c.req.valid('json')
  const result = await authService.login(body, {
    userAgent: c.req.header('user-agent'),
    // Caveat: a client can forge x-forwarded-for. Only trust it once you
    // control the proxy chain in front of this service, and then read the
    // correct position in the list rather than the first value.
    ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
  })
  return c.json(result, 200)
})

authController.openapi(refreshRoute, async (c) => {
  const { refreshToken } = c.req.valid('json')
  const result = await authService.refresh(refreshToken)
  return c.json(result, 200)
})

authController.openapi(logoutRoute, async (c) => {
  const { refreshToken } = c.req.valid('json')
  await authService.logout(refreshToken)
  return c.body(null, 204)
})

authController.openapi(meRoute, async (c) => {
  const user = getAuthUser(c)

  // TODO: fetch the full row via auth.repository.findUserById — the JWT carries
  // only id/email/role, and createdAt is not in it.
  return c.json(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: new Date().toISOString(),
    },
    200,
  )
})

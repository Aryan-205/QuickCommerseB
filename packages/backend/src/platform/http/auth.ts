import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import type { UserRole } from '../db/types.js'
import { ForbiddenError, UnauthorizedError } from '../errors/index.js'
import { verifyAccessToken } from '../security/tokens.js'
import type { AppBindings, AuthUser } from './context.js'

/**
 * Authentication: proves WHO the caller is. Rejects with 401.
 *
 * Note this never touches the database — the whole point of a stateless access
 * token. The cost is that a user deactivated 30 seconds ago still passes until
 * their token expires. That is the tradeoff you accepted by choosing JWTs, and
 * it is why access-token TTL is short.
 */
export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const header = c.req.header('authorization')

  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing bearer token')
  }

  try {
    const claims = await verifyAccessToken(header.slice('Bearer '.length))
    c.set('user', { id: claims.sub, email: claims.email, role: claims.role })
  } catch {
    // Deliberately opaque. "Expired" vs "bad signature" is a hint you do not
    // owe an attacker; the real reason is in the logs.
    throw new UnauthorizedError('Invalid or expired token')
  }

  await next()
})

/**
 * Authorization: proves the caller is ALLOWED. Rejects with 403.
 *
 * 401 and 403 are not interchangeable: 401 means "I do not know who you are,
 * authenticate"; 403 means "I know exactly who you are, and no". Returning 401
 * for an authorization failure makes clients retry logins pointlessly.
 *
 * Must be mounted AFTER requireAuth.
 */
export function requireRole(...roles: readonly UserRole[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.get('user')

    if (!user) {
      throw new UnauthorizedError('Authentication required')
    }

    if (!roles.includes(user.role)) {
      throw new ForbiddenError(`Requires one of: ${roles.join(', ')}`)
    }

    await next()
  })
}

/**
 * Reads the authenticated user, throwing if absent.
 *
 * Use this instead of `c.get('user')!` in handlers behind requireAuth — the
 * non-null assertion silently becomes a runtime crash the day someone mounts
 * the route without the middleware.
 */
export function getAuthUser(c: Context<AppBindings>): AuthUser {
  const user = c.get('user')
  if (!user) {
    throw new UnauthorizedError('Authentication required')
  }
  return user
}

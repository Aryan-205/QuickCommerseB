import type { Logger } from '../logger/index.js'
import type { UserRole } from '../db/types.js'

/** Identity attached to a request by the auth middleware. */
export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

/**
 * The Hono environment for this app.
 *
 * Everything a handler can read off `c.get(...)` is declared here, so the
 * context stays typed instead of becoming a bag of `any`. Pass this as the
 * generic to every `OpenAPIHono` instance and middleware.
 */
export interface AppBindings {
  Variables: {
    requestId: string
    logger: Logger
    /** Present only after `requireAuth` has run. */
    user: AuthUser | undefined
  }
}

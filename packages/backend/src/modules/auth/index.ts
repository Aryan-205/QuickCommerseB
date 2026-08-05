/**
 * Module barrel — the module's PUBLIC surface.
 *
 * The rule that keeps this monolith modular: other modules import from
 * `modules/auth/index.js` and nothing else. Never reach into another module's
 * repository or schema files directly.
 *
 * That single discipline is what would make extracting a module into its own
 * service a mechanical job instead of a rewrite, and it is the argument you
 * will make in the "when would you split this?" ADR.
 */
export { authController } from './auth.controller.js'
export * as authService from './auth.service.js'
export type { AuthResult, LoginInput, RegisterInput } from './auth.schema.js'

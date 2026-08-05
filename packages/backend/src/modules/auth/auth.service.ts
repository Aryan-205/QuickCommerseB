import type { AuthResult, LoginInput, RegisterInput } from './auth.schema.js'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YOURS TO WRITE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Signatures and the surrounding wiring are in place; the logic is the point of
 * the exercise. Everything you need is already available:
 *
 *   argon2                            hashing (`argon2.hash`, `argon2.verify`)
 *   platform/security/tokens.js       signAccessToken, generateRefreshToken,
 *                                     hashRefreshToken
 *   ./auth.repository.js              all data access
 *   platform/db/index.js              `db.transaction()` when you need atomicity
 *   platform/errors/index.js          UnauthorizedError, ConflictError, ...
 *
 * Ask me to explain any of the four before you start.
 */

export async function register(input: RegisterInput): Promise<AuthResult> {
  /**
   * TODO
   *  1. Hash with argon2id. Do NOT hand-roll a salt — argon2 embeds one.
   *  2. Insert the user. Let the unique index decide the duplicate case rather
   *     than doing a SELECT first: the check-then-insert pattern is a race, and
   *     two concurrent signups will both pass the check. Catch 23505 instead.
   *  3. Issue an access token and a refresh token with a NEW family_id.
   *
   * Think about: should register log the user straight in, or require email
   * verification first? Both are defensible — write down which and why.
   */
  throw new Error('Not implemented: register')
}

export async function login(input: LoginInput, context?: { userAgent?: string; ip?: string }): Promise<AuthResult> {
  /**
   * TODO
   *  1. Look up by lower(email).
   *  2. Verify with argon2.verify.
   *  3. Issue tokens with a new family_id, and persist the refresh token HASH.
   *
   * Two things people get wrong here:
   *
   *  - Return the SAME error for "no such user" and "wrong password". Different
   *    errors turn your login endpoint into an account-enumeration oracle.
   *
   *  - Response TIME also leaks. Bailing out early when the email is unknown
   *    skips the ~100ms argon2 verify, so an attacker can distinguish the two
   *    cases with a stopwatch. Fix: always run a verify, against a dummy hash
   *    when the user does not exist.
   */
  throw new Error('Not implemented: login')
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  /**
   * TODO — the most interesting one. Rotation with replay detection:
   *
   *  1. Hash the presented token, look it up. Unknown -> 401.
   *  2. If it is expired or revoked_at is set -> 401.
   *  3. REPLAY CHECK: if replaced_by is already set, this token was used once
   *     before. A legitimate client never does that, so assume theft and call
   *     revokeTokenFamily(family_id) — killing the attacker's session AND the
   *     victim's, forcing a fresh login.
   *  4. Otherwise issue a new pair in the SAME family and mark the old row
   *     replaced_by the new one.
   *
   * Steps 3 and 4 must share one transaction. Two concurrent refreshes with the
   * same token would otherwise both succeed and the audit chain forks.
   *
   * Known rough edge worth documenting: a client that fires parallel requests
   * can legitimately race two refreshes and trip the replay check. Real systems
   * add a short grace window where the immediately-previous token is still
   * accepted. Note the tradeoff in your ADR.
   */
  throw new Error('Not implemented: refresh')
}

export async function logout(refreshToken: string): Promise<void> {
  /**
   * TODO
   *  Revoke the whole family, not just this token — "log out" should end the
   *  session, not one link in its chain.
   *
   *  Note what logout CANNOT do: the access token stays valid until it expires,
   *  because nothing checks it against storage. That is the JWT tradeoff, and
   *  it is why ACCESS_TOKEN_TTL is 15 minutes. A denylist in Redis can close
   *  the gap (Phase 4) at the cost of making auth stateful again.
   */
  throw new Error('Not implemented: logout')
}

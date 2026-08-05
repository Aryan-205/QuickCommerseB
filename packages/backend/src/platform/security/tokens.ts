import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

import { env } from '../config/env.js'
import type { UserRole } from '../db/types.js'

/**
 * Token primitives. Infrastructure only — the login/refresh/rotation FLOW lives
 * in the auth module, because that flow is the part with the interesting
 * decisions in it.
 *
 * The split that matters:
 *
 *   ACCESS TOKEN  — a signed JWT, stateless, never checked against the database.
 *                   That is what makes it fast, and also why it CANNOT be
 *                   revoked. Its TTL is your worst-case window between a logout
 *                   and the token actually dying. Keep it short (15m).
 *
 *   REFRESH TOKEN — opaque random bytes, stored hashed, checked on every use.
 *                   Long-lived, revocable, rotated on each use.
 *
 * A JWT is signed, not encrypted. Anyone holding it can read the payload.
 * Never put anything secret in it.
 */

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET)

export interface AccessTokenClaims {
  sub: string
  email: string
  role: UserRole
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ email: claims.email, role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('quickcommerce')
    .setAudience('quickcommerce-api')
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessSecret)
}

/**
 * Throws if the token is expired, tampered with, or issued for a different
 * audience. Callers should treat any throw as a plain 401 and must NOT leak the
 * reason — "expired" vs "invalid signature" is useful information to an attacker.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: 'quickcommerce',
    audience: 'quickcommerce-api',
  })

  if (!payload.sub || typeof payload.email !== 'string' || typeof payload.role !== 'string') {
    throw new Error('Malformed access token payload')
  }

  return { sub: payload.sub, email: payload.email, role: payload.role as UserRole }
}

/**
 * Refresh tokens are opaque random strings, not JWTs — there is nothing to
 * read, and revocability comes from the fact that the server checks storage.
 * 32 bytes of CSPRNG output is well beyond brute-force reach.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Store the HASH, never the token. A database leak must not hand an attacker a
 * set of live sessions.
 *
 * SHA-256 rather than argon2 here on purpose: this input is 256 bits of
 * uniform randomness, so it is not brute-forceable and needs no key stretching
 * — and this runs on every refresh, where argon2's cost would be a latency bug.
 * User passwords are the opposite case and DO need argon2.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

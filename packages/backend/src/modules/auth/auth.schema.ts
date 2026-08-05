import { z } from '@hono/zod-openapi'

/**
 * The API contract for auth.
 *
 * These schemas do three jobs from one declaration: runtime validation,
 * TypeScript types, and the OpenAPI document served at /docs. That is the whole
 * reason for @hono/zod-openapi — hand-written docs drift from reality within
 * about two weeks.
 */

export const RegisterBody = z
  .object({
    email: z.email().max(255),
    // Length is the only rule worth enforcing. Composition rules ("one symbol,
    // one digit") measurably push users toward Password1! and are no longer
    // recommended by NIST. Length plus a breach-list check beats them.
    password: z.string().min(8).max(128),
    phone: z
      .string()
      .regex(/^\+?[1-9]\d{7,14}$/, 'Must be a valid E.164 phone number')
      .optional(),
  })
  .openapi('RegisterBody')

export const LoginBody = z
  .object({
    email: z.email(),
    password: z.string().min(1),
  })
  .openapi('LoginBody')

export const RefreshBody = z
  .object({
    refreshToken: z.string().min(1),
  })
  .openapi('RefreshBody')

export const PublicUser = z
  .object({
    id: z.uuid(),
    email: z.email(),
    role: z.enum(['customer', 'admin', 'picker', 'rider']),
    createdAt: z.iso.datetime(),
  })
  .openapi('PublicUser')

export const AuthTokens = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    /** Seconds until the access token expires. */
    expiresIn: z.number().int(),
  })
  .openapi('AuthTokens')

export const AuthResponse = z
  .object({
    user: PublicUser,
    tokens: AuthTokens,
  })
  .openapi('AuthResponse')

export type RegisterInput = z.infer<typeof RegisterBody>
export type LoginInput = z.infer<typeof LoginBody>
export type AuthResult = z.infer<typeof AuthResponse>

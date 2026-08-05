import type { Kysely } from 'kysely'

import { db } from '../../platform/db/index.js'
import type { DB, User } from '../../platform/db/types.js'

/**
 * Data access for auth. No business rules live here — this layer only knows how
 * to read and write rows.
 *
 * Every function takes an optional `trx`. That is what lets a service compose
 * several repository calls inside ONE transaction: pass the transaction handle
 * through, and they all commit or all roll back together. Without it you would
 * be forced to either put transaction logic in the repository (wrong layer) or
 * give up atomicity (worse).
 */
type Executor = Kysely<DB>

export async function findUserByEmail(
  email: string,
  trx: Executor = db,
): Promise<User | undefined> {
  return trx
    .selectFrom('users')
    .selectAll()
    // Must match the functional index `users_email_lower_key`. Query with a
    // plain `= email` and Postgres cannot use that index — it will seq-scan.
    .where((eb) => eb(eb.fn('lower', ['email']), '=', email.toLowerCase()))
    .executeTakeFirst()
}

export async function findUserById(id: string, trx: Executor = db): Promise<User | undefined> {
  return trx.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function insertUser(
  values: { email: string; password_hash: string; phone?: string | null },
  trx: Executor = db,
): Promise<User> {
  return trx
    .insertInto('users')
    .values({
      email: values.email.toLowerCase(),
      password_hash: values.password_hash,
      phone: values.phone ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function insertRefreshToken(
  values: {
    user_id: string
    family_id: string
    token_hash: string
    expires_at: Date
    user_agent?: string | null
    ip?: string | null
  },
  trx: Executor = db,
): Promise<{ id: string }> {
  return trx
    .insertInto('refresh_tokens')
    .values({
      user_id: values.user_id,
      family_id: values.family_id,
      token_hash: values.token_hash,
      expires_at: values.expires_at,
      user_agent: values.user_agent ?? null,
      ip: values.ip ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
}

export async function findRefreshTokenByHash(tokenHash: string, trx: Executor = db) {
  return trx
    .selectFrom('refresh_tokens')
    .selectAll()
    .where('token_hash', '=', tokenHash)
    .executeTakeFirst()
}

export async function markRefreshTokenReplaced(
  id: string,
  replacedBy: string,
  trx: Executor = db,
): Promise<void> {
  await trx
    .updateTable('refresh_tokens')
    .set({ revoked_at: new Date(), replaced_by: replacedBy })
    .where('id', '=', id)
    .execute()
}

/**
 * Nuclear option for replay detection: revoke every token in a session family.
 *
 * Called when an ALREADY-REPLACED refresh token is presented. That can only
 * happen if a token was captured, so the safe assumption is compromise — kill
 * the whole family and force a fresh login.
 */
export async function revokeTokenFamily(familyId: string, trx: Executor = db): Promise<number> {
  const result = await trx
    .updateTable('refresh_tokens')
    .set({ revoked_at: new Date() })
    .where('family_id', '=', familyId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst()

  return Number(result.numUpdatedRows)
}

import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

import { env } from '../config/env.js'
import { logger } from '../logger/index.js'
import type { DB } from './types.js'

/**
 * Postgres type parsers.
 *
 * node-postgres returns bigint (int8, OID 20) as a *string*, because a 64-bit
 * integer does not fit in a JS number. That is technically correct and
 * practically a trap: `total_paise` would silently become "129900" and string
 * concatenation would replace your arithmetic.
 *
 * All our bigints are paise counts. Number.MAX_SAFE_INTEGER paise is roughly
 * ₹90 trillion, so coercing to number is safe here — but it IS a deliberate
 * decision, not a default. If you ever add a genuinely large counter, revisit.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value))

/**
 * ONE pool for the entire process.
 *
 * A Postgres connection is a forked backend process on the server (~5-10MB),
 * not a cheap socket, and the default max_connections is 100. Creating a client
 * per request means hundreds of process spawns per second and then
 * `too many clients already` — a failure that only ever appears under load,
 * which is why it survives local testing and dies in production.
 *
 * The invariant to hold in your head:
 *     instances x DATABASE_POOL_MAX  <  max_connections - headroom
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  // Return connections to Postgres when traffic dies down.
  idleTimeoutMillis: 30_000,
  // Fail fast instead of hanging forever when the pool is exhausted or the
  // database is unreachable. Without this, a database outage turns into
  // requests that hang until the client gives up.
  connectionTimeoutMillis: 5_000,
  // Shows up in pg_stat_activity — invaluable when you are trying to work out
  // which service is holding a lock.
  application_name: 'quickcommerce-api',
})

/**
 * An idle client can emit 'error' (network blip, database restart, admin
 * terminating the backend). With no listener attached, Node treats it as an
 * unhandled 'error' event and kills the process. This single listener is the
 * difference between a blip and an outage.
 */
pool.on('error', (error) => {
  logger.error({ err: error }, 'idle postgres client error')
})

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool }),
  log: (event) => {
    if (event.level === 'error') {
      logger.error(
        { err: event.error, durationMs: event.queryDurationMillis, sql: event.query.sql },
        'query failed',
      )
      return
    }

    // Slow-query surfacing. Crude now; Phase 7 replaces it with real tracing.
    if (event.queryDurationMillis > 200) {
      logger.warn(
        { durationMs: event.queryDurationMillis, sql: event.query.sql },
        'slow query',
      )
    }
  },
})

/** Verifies the database is actually reachable. Used by the readiness probe. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await db.selectNoFrom((eb) => eb.lit(1).as('ok')).executeTakeFirst()
    return true
  } catch (error) {
    logger.error({ err: error }, 'database ping failed')
    return false
  }
}

/** Closes every pooled connection. Call this on shutdown, once, and await it. */
export async function closeDatabase(): Promise<void> {
  await db.destroy()
}

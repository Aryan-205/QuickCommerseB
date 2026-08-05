import { PostgresDialect } from 'kysely'
import { defineConfig } from 'kysely-ctl'
import pg from 'pg'

/**
 * Config for the `kysely` CLI (migrations only). Deliberately separate from
 * src/platform/db — the CLI runs outside the app and must not drag the app's
 * env validation, logger, and pool settings along with it.
 */
try {
  // Node's built-in .env loader. No dotenv dependency needed.
  process.loadEnvFile('.env')
} catch {
  // No .env file — fall back to whatever is already in the environment (CI).
}

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run migrations. Copy .env.example to .env.')
}

export default defineConfig({
  dialect: new PostgresDialect({
    // Migrations are short-lived and serial; one connection is plenty.
    pool: new pg.Pool({ connectionString, max: 1 }),
  }),
  migrations: {
    migrationFolder: 'migrations',
  },
})

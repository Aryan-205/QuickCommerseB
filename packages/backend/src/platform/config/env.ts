import { z } from 'zod'

/**
 * The ONLY place in the codebase allowed to touch `process.env`.
 *
 * Everything is parsed and validated once, at boot, before the server binds a
 * port. If configuration is wrong the process exits non-zero immediately.
 *
 * Why fail at boot rather than on first use? A lazily-read config lets the
 * process start, pass its health check, accept traffic, and only then fail —
 * so your orchestrator happily routes users to a broken instance and never
 * rolls back. Crashing at startup is a deploy failure, which is what you want.
 */

/**
 * Load .env in local development only.
 *
 * `process.loadEnvFile` is built into Node 20.6+, so no dotenv dependency. It
 * does NOT overwrite variables already present in the environment, which is the
 * behaviour you want: a real value passed by the shell or the orchestrator must
 * always win over a file on disk.
 *
 * Skipped in production, where configuration comes from the platform. A
 * production process reading a .env file off the filesystem is a smell — it
 * means secrets are sitting in an image or on a volume.
 */
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile()
  } catch {
    // No .env present — fine in CI and in tests, where vars are injected.
  }
}

const durationPattern = /^\d+[smhd]$/

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  // No defaults, by design. A fallback secret is how a development key ends up
  // signing production tokens. 32 chars is the floor for HS256 to be meaningful.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),

  ACCESS_TOKEN_TTL: z.string().regex(durationPattern).default('15m'),
  REFRESH_TOKEN_TTL: z.string().regex(durationPattern).default('30d'),

  RESERVATION_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
})

export type Env = z.infer<typeof EnvSchema>

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)

  if (!parsed.success) {
    // Print something a human can act on. A raw ZodError dump at 3am is not it.
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')

    process.stderr.write(
      `\nInvalid environment configuration:\n${issues}\n\n` +
        `Copy .env.example to .env and fill in the missing values.\n\n`,
    )
    process.exit(1)
  }

  // Secrets must never reach a log line, an error report, or a crash dump.
  // Freezing does not prevent that, but it does stop accidental mutation.
  return Object.freeze(parsed.data)
}

export const env = loadEnv()

export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'

import { pino, stdSerializers } from 'pino'

import { env, isProduction, isTest } from '../config/env.js'

/**
 * Structured JSON logging.
 *
 * JSON, not printf strings, because in Phase 7 these lines get shipped to Loki
 * and queried by field. `logger.info({ orderId, storeId }, 'order placed')` is
 * searchable; `logger.info(\`order \${id} placed\`)` is a grep problem.
 *
 * In development a pretty transport makes it human-readable. In production the
 * raw JSON goes to stdout and the platform handles collection — an application
 * should never own log files or rotation.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,

  /**
   * Redaction is not optional. Logs get shipped, indexed, and read by people
   * who should not see credentials. Everything here is a path pino prunes
   * before serialising.
   */
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      '*.password',
      '*.password_hash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      'password',
      'password_hash',
    ],
    censor: '[redacted]',
  },

  // Error objects do not JSON.stringify usefully on their own — this keeps
  // stack traces intact under the `err` key.
  serializers: {
    err: stdSerializers.err,
  },

  base: { service: 'quickcommerce-api' },

  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname,service',
        },
      },
})

export type Logger = typeof logger

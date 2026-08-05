import { serve } from '@hono/node-server'

import { createApp } from './app.js'
import { env } from './platform/config/env.js'
import { closeDatabase } from './platform/db/index.js'
import { logger } from './platform/logger/index.js'

const app = createApp()

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info(
    { port: info.port, env: env.NODE_ENV, docs: `http://localhost:${info.port}/docs` },
    'server listening',
  )
})

/**
 * Graceful shutdown.
 *
 * On SIGTERM (what Docker and Kubernetes send) the default is to die instantly,
 * killing in-flight requests and leaving pooled connections dangling. Every
 * deploy then produces a burst of 502s.
 *
 * The correct sequence:
 *   1. stop accepting new connections
 *   2. let in-flight requests finish
 *   3. close the database pool
 *   4. exit 0
 *
 * The timeout matters as much as the sequence: a request that hangs must not
 * hold the whole deploy hostage. Force-exit after it, non-zero, so the failure
 * is visible rather than silent.
 */
const SHUTDOWN_TIMEOUT_MS = 10_000
let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  // A second Ctrl-C should not start a parallel shutdown.
  if (shuttingDown) return
  shuttingDown = true

  logger.info({ signal }, 'shutting down')

  const forceExit = setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  // Do not let this timer keep the event loop alive if we finish early.
  forceExit.unref()

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    await closeDatabase()

    logger.info('shutdown complete')
    process.exit(0)
  } catch (error) {
    logger.error({ err: error }, 'error during shutdown')
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

/**
 * A promise rejection nobody caught means state is now unknown — some code
 * path stopped halfway. Log it and exit rather than limping on: a process in an
 * undefined state serving traffic is worse than a restart.
 */
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection')
  void shutdown('unhandledRejection')
})

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception')
  process.exit(1)
})

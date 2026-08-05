import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Co-located with the code they test.
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Testcontainers pulls an image on the first run, which is slow but only
    // happens once. The default 5s timeout would fail that run.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      // Placeholders so platform/config/env.ts passes at import time. Tests
      // that need a real database get one from Testcontainers and override this.
      DATABASE_URL: 'postgresql://quickcommerce:quickcommerce@localhost:5432/quickcommerce',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
    },
  },
})

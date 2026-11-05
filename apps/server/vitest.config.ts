import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@parkinggack/api-types': fileURLToPath(new URL('../../packages/api-types/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    env: { NODE_ENV: 'test', TZ: 'Asia/Seoul' },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})

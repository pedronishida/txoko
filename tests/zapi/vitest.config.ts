import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@helpers': resolve(__dirname, 'helpers'),
      '@fixtures': resolve(__dirname, 'fixtures'),
      '@suites': resolve(__dirname, 'suites'),
      '@scripts': resolve(__dirname, 'scripts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['suites/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 15000,
    maxConcurrency: 4,
    reporters: ['verbose'],
    setupFiles: ['helpers/config.ts'],
    env: {
      NODE_ENV: 'test',
    },
  },
})

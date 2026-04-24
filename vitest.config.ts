import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 10_000,
    env: {
      TURSO_URL: ':memory:',
      TURSO_TOKEN: 'test',
      NODE_ENV: 'test',
    },
  },
  resolve: {
    alias: {
      '@': new URL('./', import.meta.url).pathname,
    },
  },
});

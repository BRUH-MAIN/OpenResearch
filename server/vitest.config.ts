import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://test:test@localhost:5433/openresearch_test';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The suite drives one Express app against one database; running files in
    // parallel would let their TRUNCATEs race each other.
    fileParallelism: false,
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test-access-secret-at-least-32-characters-long!!',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long!',
      AI_SERVICE_URL: 'http://localhost:8000',
      CLIENT_URL: 'http://localhost:3000',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/seed.ts', 'src/db/migrate.ts'],
    },
  },
});

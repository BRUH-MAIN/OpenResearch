import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-secret-key-at-least-32-characters-long-for-testing',
      JWT_REFRESH_SECRET: 'test-refresh-secret-key-at-least-32-characters-long',
      GROQ_API_KEY: 'test-groq-api-key-for-testing',
      AI_SERVICE_URL: 'http://localhost:8000',
      CLIENT_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/seed.ts'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});

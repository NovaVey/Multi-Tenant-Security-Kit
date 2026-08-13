import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Integration tests (currently just RLS-against-real-Postgres) need
    // Docker and live in their own vitest project — see
    // vitest.integration.config.ts / `npm run test:integration` — so
    // contributors without Docker aren't blocked on the fast unit suite,
    // and this suite's coverage numbers aren't skewed by a slow outlier.
    exclude: ['test/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/types.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});

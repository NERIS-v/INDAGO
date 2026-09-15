import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    // Frozen-contracts-only stage: the PR9 test suite lands with the
    // implementation PR. Keep `pnpm -r test` green in the meantime.
    passWithNoTests: true,
  },
});
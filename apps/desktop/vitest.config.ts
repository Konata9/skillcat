import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared'),
    },
  },
  test: {
    // Tests live in `__tests__` folders only, never beside production code, so
    // the bundler (which follows imports from the entry files) never sees them.
    include: ['src/**/__tests__/*.test.ts', 'src/**/__tests__/*.test.tsx'],
  },
});

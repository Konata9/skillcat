import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Resolve the workspace `@skillcat/core` package from source instead of its
// prebuilt `dist`. Vite then watches the source, so core edits hot-reload the
// renderer (HMR) and rebuild/restart the main bundle — no `core build` step and
// no restarting `pnpm desktop` while iterating.
const coreSource = {
  '@skillcat/core/keys': resolve('../../packages/core/src/keys.ts'),
  '@skillcat/core/proxy': resolve('../../packages/core/src/cli/proxy.ts'),
  '@skillcat/core/llm': resolve('../../packages/core/src/llm.ts'),
  '@skillcat/core': resolve('../../packages/core/src/index.ts'),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        ...coreSource,
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        ...coreSource,
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        ...coreSource,
      },
    },
    // Core is aliased to source above; keep the dep optimizer away from it so a
    // stale pre-bundle of `@skillcat/core` can never shadow the subpath aliases.
    optimizeDeps: {
      exclude: ['@skillcat/core', '@skillcat/core/llm', '@skillcat/core/keys', '@skillcat/core/proxy'],
    },
    plugins: [react(), tailwindcss()],
  },
});

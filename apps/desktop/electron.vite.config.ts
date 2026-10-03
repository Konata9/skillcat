import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';

// Dev needs inline scripts for the React Fast Refresh preamble and a websocket
// connection to the Vite server; the production renderer needs neither.
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' ws: http: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  let isDev = false;
  return {
    name: 'skillcat-csp',
    configResolved(config) {
      isDev = config.command === 'serve';
    },
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: isDev ? DEV_CSP : PROD_CSP,
          },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// Resolve the workspace `@skillcat/core` package from source instead of its
// prebuilt `dist`. Vite then watches the source, so core edits hot-reload the
// renderer (HMR) and rebuild/restart the main bundle — no `core build` step and
// no restarting `pnpm desktop` while iterating.
const coreSource = {
  '@skillcat/core/keys': resolve('../../packages/core/src/keys.ts'),
  '@skillcat/core/proxy': resolve('../../packages/core/src/cli/proxy.ts'),
  '@skillcat/core/llm': resolve('../../packages/core/src/llm.ts'),
  '@skillcat/core/activity': resolve('../../packages/core/src/bridge/limits.ts'),
  '@skillcat/core/logging': resolve('../../packages/core/src/logging.ts'),
  '@skillcat/core': resolve('../../packages/core/src/index.ts'),
};

const sharedAliases = {
  '@shared': resolve('src/shared'),
  ...coreSource,
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAliases },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAliases },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        ...sharedAliases,
      },
    },
    // Core is aliased to source above; keep the dep optimizer away from it so a
    // stale pre-bundle of `@skillcat/core` can never shadow the subpath aliases.
    optimizeDeps: {
      exclude: Object.keys(coreSource),
    },
    plugins: [react(), tailwindcss(), cspPlugin()],
  },
});

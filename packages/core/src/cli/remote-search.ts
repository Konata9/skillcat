/**
 * Barrel for remote skill access. HTTP API calls live in `remote-search/api.ts`
 * and the `npx skills find` fallback parser in `remote-search/parse.ts`; this
 * barrel keeps the historical import path stable.
 */
export * from './remote-search/api.js';
export * from './remote-search/parse.js';

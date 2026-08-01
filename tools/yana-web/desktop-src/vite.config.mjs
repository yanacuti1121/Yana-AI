// Yana AI desktop — Vite build config. Source lives here (desktop-src/);
// the build writes directly to ../desktop/, which is what server.js's
// hardcoded /desktop/index.html routes and rewrites actually serve — so
// the built app is reachable with zero server.js changes. tools/yana-web/
// desktop/ is therefore now generated output (gitignored), not source;
// run `npm run build:desktop` (from tools/yana-web/) before `npm start`
// or before packaging the Electron app.
//
// .mjs extension so this loads as ESM regardless of the yana-web
// package.json's "type": "commonjs" (Vite's own config loader would handle
// either way, but the explicit extension removes any ambiguity).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  // App is served at /desktop/index.html, not domain root — without this,
  // Vite emits root-relative asset paths (/assets/...) that resolve to
  // tools/yana-web/assets/ on disk (doesn't exist) instead of
  // tools/yana-web/desktop/assets/ (the real build output), 404-ing every
  // JS/CSS asset and white-screening the app.
  base: '/desktop/',
  plugins: [react()],
  resolve: {
    alias: {
      // shared/ is also consumed by the (out-of-scope, unmodified) mobile
      // frontend as raw classic scripts — this alias lets desktop's source
      // import the same source files as real ES modules without
      // duplicating them.
      '@shared': path.resolve(here, '../shared'),
    },
  },
  build: {
    outDir: '../desktop',
    emptyOutDir: true,
  },
});

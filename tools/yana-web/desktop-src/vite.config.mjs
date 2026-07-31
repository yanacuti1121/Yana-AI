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

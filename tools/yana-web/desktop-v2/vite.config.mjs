// Yana AI desktop-v2 — Vite build config.
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
      // frontend as raw classic scripts — this alias lets desktop-v2 import
      // the same source files as real ES modules without duplicating them.
      '@shared': path.resolve(here, '../shared'),
    },
  },
  build: {
    // Named "build", not "dist" — tools/yana-desktop/package.json's
    // electron-builder extraFiles filter excludes "!dist/**" when copying
    // yana-web/ into the packaged app; "build" sidesteps that collision
    // entirely instead of requiring a filter edit.
    outDir: 'build',
    emptyOutDir: true,
  },
});

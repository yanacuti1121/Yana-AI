// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  outDir: '../docs-dist',
  site: 'https://yanacuti1121.github.io/yana-ai',
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
});

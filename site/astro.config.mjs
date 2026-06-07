// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  outDir: '../docs-dist',
  site: 'https://phamlongh230-lgtm.github.io/yamtam-engine',
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
});

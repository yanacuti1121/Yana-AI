// Dựng trang danh mục (catalog/) ra một thư mục ngoài repo. Chạy:
//   CATALOG_OUT=/duong/dan/ra node studio-web/node_modules/vite/bin/vite.js build --config studio-web/vite.catalog.config.mjs
// react và react-dom lấy từ tools/yana-studio để chỉ có một bản; mọi gói khác lấy từ studio-web/node_modules.
import { defineConfig } from 'vite';
import react from '../../yana-studio/node_modules/@vitejs/plugin-react/dist/index.js';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const studioModules = path.resolve(here, '../../yana-studio/node_modules');
const outDir = process.env.CATALOG_OUT;
if (!outDir) throw new Error('Set CATALOG_OUT to the output directory');

export default defineConfig({
	root: path.join(here, 'catalog'),
	base: './',
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			react: path.join(studioModules, 'react'),
			'react-dom': path.join(studioModules, 'react-dom'),
			'storybook/preview-api': path.join(here, 'catalog/storybook-shim.ts'),
			'@cline/ui': path.join(here, 'vendor/cline-ui'),
		},
	},
	build: { outDir: path.resolve(outDir), emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 4000 },
});

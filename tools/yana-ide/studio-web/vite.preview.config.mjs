// Dựng trang xem thử (preview/) ra một thư mục ngoài repo. Chạy:
//   PREVIEW_OUT=/duong/dan/ra node studio-web/node_modules/vite/bin/vite.js build --config studio-web/vite.preview.config.mjs
// Dùng react của tools/yana-studio như vite.config.mjs, Tailwind và vite của studio-web.
import { defineConfig } from 'vite';
import react from '../../yana-studio/node_modules/@vitejs/plugin-react/dist/index.js';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const studioModules = path.resolve(here, '../../yana-studio/node_modules');
const outDir = process.env.PREVIEW_OUT;
if (!outDir) throw new Error('Set PREVIEW_OUT to the output directory');

export default defineConfig({
	root: path.join(here, 'preview'),
	base: './',
	plugins: [react(), tailwindcss()],
	resolve: { alias: { react: path.join(studioModules, 'react'), 'react-dom': path.join(studioModules, 'react-dom') } },
	build: { outDir: path.resolve(outDir), emptyOutDir: true, sourcemap: false },
});

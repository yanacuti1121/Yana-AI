// Đóng gói các màn React của app Yana Studio cũ để chạy trong webview của IDE.
// Dùng node_modules sẵn có của tools/yana-studio (react, react-dom, lucide-react, @vitejs/plugin-react),
// không cài thêm gói nào. Kết quả ghi vào extensions/yana-agent/media/studio/.
import { defineConfig } from '../../yana-studio/node_modules/vite/dist/node/index.js';
import react from '../../yana-studio/node_modules/@vitejs/plugin-react/dist/index.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const studioModules = path.resolve(here, '../../yana-studio/node_modules');

export default defineConfig({
	root: here,
	base: './',
	plugins: [react()],
	resolve: {
		alias: {
			react: path.join(studioModules, 'react'),
			'react-dom': path.join(studioModules, 'react-dom'),
			'lucide-react': path.join(studioModules, 'lucide-react'),
		},
	},
	build: {
		outDir: path.resolve(here, '../extensions/yana-agent/media/studio'),
		emptyOutDir: true,
		sourcemap: false,
		cssCodeSplit: true,
		// manifest: features/studio-screens.js đọc nó để biết mỗi màn cần file JS/CSS nào (tên CSS dùng chung do Vite đặt).
		manifest: 'manifest.json',
		rollupOptions: {
			input: { canvas: path.join(here, 'canvas-entry.tsx'), settings: path.join(here, 'settings-entry.tsx'), tasks: path.join(here, 'tasks-entry.tsx'), permissions: path.join(here, 'permissions-entry.tsx') },
			output: { entryFileNames: '[name].js', assetFileNames: '[name][extname]', chunkFileNames: 'shared-[name].js' },
		},
	},
});

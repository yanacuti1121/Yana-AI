// Gắn nguyên màn Design Canvas của app Yana Studio cũ (tools/yana-studio/renderer/DesignCanvas.tsx) vào
// webview của IDE. Không sửa component cũ: dữ liệu đi qua cầu nối window.studio (bridge.ts).
import { vscodeApi } from './bridge';
import { createRoot } from 'react-dom/client';
import { DesignCanvas } from '../../yana-studio/renderer/DesignCanvas';
import './ide-theme.css';

const mount = document.getElementById('app');
const root = document.body.dataset.root || '';

if (mount) {
	createRoot(mount).render(
		<DesignCanvas
			root={root}
			locale="en"
			onError={message => vscodeApi.postMessage({ type: 'studio:notice', message })}
			onPrompt={prompt => vscodeApi.postMessage({ type: 'studio:prompt', prompt })}
		/>,
	);
}

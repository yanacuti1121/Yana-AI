// Gắn nguyên màn Tasks của app Yana Studio cũ (tools/yana-studio/renderer/Tasks.tsx) vào webview của IDE.
// Dữ liệu là kho task thật của yana-rt, đi qua cầu nối window.studio (features/studio-governance-bridge.js).
import { createRoot } from 'react-dom/client';

import { vscodeApi } from './bridge';
import { useIdeRefresh } from './refresh';
import { Tasks } from '../../yana-studio/renderer/Tasks';
import '../../yana-studio/renderer/style.css';
import '../../yana-studio/renderer/dark-theme.css';
import './ide-theme.css';

function TasksScreen() {
	const version = useIdeRefresh(['tasks', 'trust', 'visible']);
	return (
		<Tasks
			key={version}
			root={document.body.dataset.root || ''}
			onError={message => vscodeApi.postMessage({ type: 'studio:notice', message })}
		/>
	);
}

document.documentElement.dataset.theme = 'dark';
const mount = document.getElementById('app');
if (mount) createRoot(mount).render(<TasksScreen />);

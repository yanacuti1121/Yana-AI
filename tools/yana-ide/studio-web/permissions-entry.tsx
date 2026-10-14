// Gắn nguyên màn Permissions của app Yana Studio cũ (tools/yana-studio/renderer/Permissions.tsx) vào webview
// của IDE: lease đang có, cấp lease mới, thu hồi, và các lệnh đang chờ người duyệt. Dữ liệu là của yana-rt.
import { createRoot } from 'react-dom/client';

import { vscodeApi } from './bridge';
import { useIdeRefresh } from './refresh';
import { Permissions } from '../../yana-studio/renderer/Permissions';
import '../../yana-studio/renderer/style.css';
import '../../yana-studio/renderer/dark-theme.css';
import './ide-theme.css';

function PermissionsScreen() {
	const version = useIdeRefresh(['governance', 'trust', 'visible']);
	return (
		<Permissions
			key={version}
			root={document.body.dataset.root || ''}
			locale="en"
			onError={message => vscodeApi.postMessage({ type: 'studio:notice', message })}
		/>
	);
}

document.documentElement.dataset.theme = 'dark';
const mount = document.getElementById('app');
if (mount) createRoot(mount).render(<PermissionsScreen />);

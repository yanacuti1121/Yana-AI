// Gắn nguyên màn Settings của app Yana Studio cũ (tools/yana-studio/renderer/Settings.tsx) vào webview của IDE.
// Không viết lại giao diện: State lấy qua window.studio.bootstrap() (features/studio-settings-bridge.js).
// Các mục IDE chưa có phần chạy thật (tài khoản, giao diện, Connections, sao lưu) được ẩn bằng prop của màn cũ.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { vscodeApi } from './bridge';
import { useIdeRefresh } from './refresh';
import { Settings } from '../../yana-studio/renderer/Settings';
import type { State } from '../../yana-studio/renderer/types';
import '../../yana-studio/renderer/style.css';
import '../../yana-studio/renderer/dark-theme.css';
import './ide-theme.css';

const HIDDEN_SECTIONS = ['account', 'appearance', 'connections'];

function notify(message: string): void {
	vscodeApi.postMessage({ type: 'studio:notice', message });
}

function SettingsScreen() {
	const [state, setState] = useState<State | null>(null);
	const [error, setError] = useState('');
	const root = document.body.dataset.root || '';
	const section = useRef<string | undefined>(undefined);
	const version = useIdeRefresh(['config', 'secrets', 'usage', 'trust', 'visible']);
	useEffect(() => {
		window.studio.bootstrap().then(setState).catch((reason: unknown) => setError(String(reason)));
	}, [version]);
	if (error) return <p className="muted ide-load-error">Could not load Yana settings: {error}</p>;
	if (!state) return <p className="muted ide-loading">Loading Yana settings…</p>;
	return (
		<Settings
			key={version}
			initialSection={section.current}
			onSectionChange={next => { section.current = next; }}
			state={state}
			onState={setState}
			onClose={() => vscodeApi.postMessage({ type: 'studio:close' })}
			onError={notify}
			projectRoot={root}
			onOpenTerminal={command => vscodeApi.postMessage({ type: 'studio:terminal', command: command || '' })}
			hiddenSections={HIDDEN_SECTIONS}
			showBackup={false}
		/>
	);
}

document.documentElement.dataset.theme = 'dark';
const mount = document.getElementById('app');
if (mount) createRoot(mount).render(<SettingsScreen />);

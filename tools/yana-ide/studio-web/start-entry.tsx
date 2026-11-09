// Khu "Start" của IDE. Extension host gửi dữ liệu thật qua postMessage; màn này chỉ hiển thị và báo lại lệnh được bấm.
// Phía host (features/home.js chuyển sang webview view) chưa viết: cho tới lúc đó entry này chỉ chạy được trong trang xem thử.
//   web -> host: { type: 'yana:ready' } khi mở, { type: 'yana:run-command', command } khi bấm
//   host -> web: { type: 'yana:start-data', data: StartData }
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { vscodeApi } from './bridge';
import { StartScreen, type StartData } from './start-screen';
import './start.css';

const EMPTY: StartData = { sections: [], status: { editor: null, runtime: null, audit: null } };

function StartHost() {
	const [data, setData] = useState<StartData>(EMPTY);
	useEffect(() => {
		const onMessage = ({ data: message }: MessageEvent) => {
			if (message?.type === 'yana:start-data' && message.data) setData(message.data as StartData);
		};
		window.addEventListener('message', onMessage);
		vscodeApi.postMessage({ type: 'yana:ready' });
		return () => window.removeEventListener('message', onMessage);
	}, []);
	return <StartScreen data={data} onRun={command => vscodeApi.postMessage({ type: 'yana:run-command', command })} />;
}

const mount = document.getElementById('app');
if (mount) createRoot(mount).render(<StartHost />);

// Cầu nối window.studio cho các màn React của app Yana Studio cũ khi chạy trong webview của IDE.
// App cũ gọi window.studio.<hàm>(...) qua Electron IPC (host/preload.cjs). Ở đây mỗi lời gọi được gửi
// tới extension host bằng postMessage và trả kết quả về bằng Promise, nên các màn cũ chạy nguyên không sửa.
// Phía extension (features/studio-bridge.js) chỉ trả lời các hàm nó đã khai báo; hàm khác bị từ chối.

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

export const vscodeApi = acquireVsCodeApi();
const pending = new Map<number, Pending>();
const listeners = new Map<string, Set<(value: unknown) => void>>();
let sequence = 0;

window.addEventListener('message', ({ data }) => {
	if (data?.type === 'studio:result') {
		const entry = pending.get(data.id);
		if (!entry) return;
		pending.delete(data.id);
		if (data.ok) entry.resolve(data.value);
		else entry.reject(new Error(String(data.error || 'Request failed')));
	} else if (data?.type === 'studio:event') {
		for (const callback of listeners.get(data.channel) || []) callback(data.value);
	}
});

function call(method: string, args: unknown[]): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const id = ++sequence;
		pending.set(id, { resolve, reject });
		vscodeApi.postMessage({ type: 'studio:call', id, method, args });
	});
}

function on(channel: string, callback: (value: unknown) => void): () => void {
	const set = listeners.get(channel) || new Set();
	set.add(callback);
	listeners.set(channel, set);
	return () => set.delete(callback);
}

// Ép kiểu an toàn: chỉ thêm một thuộc tính mới vào window, đúng tên mà các màn cũ đọc (window.studio).
(window as unknown as { studio: unknown }).studio = new Proxy({}, {
	get: (_target, method) => (method === 'on' ? on : (...args: unknown[]) => call(String(method), args)),
});

'use strict';
// Kênh "có gì đó vừa đổi" dùng chung. Mỗi nơi hiển thị dữ liệu (cây bên trái, khung chat, trang chủ, các màn
// Settings/Tasks/Permissions) lắng nghe kênh này để nạp lại, thay vì tự nạp một lần rồi giữ số liệu cũ.
// Các loại thay đổi (kind): 'config' (cài đặt yana.*), 'secrets' (API key), 'trust' (cấp quyền thư mục),
// 'tasks', 'governance' (lease, duyệt), 'usage' (token). Gom các thay đổi dồn dập thành một lần phát.

const vscode = require('vscode');

const DEBOUNCE_MS = 250; // gom các thay đổi liên tiếp (ví dụ lưu key kéo theo đổi cấu hình)

class SimpleEventEmitter {
	constructor() { this._listeners = new Set(); }
	get event() { return listener => { this._listeners.add(listener); return { dispose: () => this._listeners.delete(listener) }; }; }
	fire(data) { for (const listener of this._listeners) listener(data); }
}

let emitter;
function getEmitter() {
	if (!emitter) {
		emitter = vscode.EventEmitter ? new vscode.EventEmitter() : new SimpleEventEmitter();
	}
	return emitter;
}
const pending = new Set();
let timer;

// Báo một loại thay đổi. Người nghe nhận mảng các kind đã gom.
function fire(kind) {
	pending.add(kind);
	clearTimeout(timer);
	timer = setTimeout(() => {
		const kinds = [...pending];
		pending.clear();
		getEmitter().fire(kinds);
	}, DEBOUNCE_MS);
}

// Lắng nghe, chỉ gọi khi có ít nhất một kind trong danh sách (không truyền danh sách: nhận mọi thay đổi).
function listen(kinds, callback) {
	return getEmitter().event(fired => {
		if (!kinds || fired.some(kind => kinds.includes(kind))) callback(fired);
	});
}

function activate(context) {
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => event.affectsConfiguration('yana') && fire('config')),
		context.secrets.onDidChange(() => fire('secrets')),
		vscode.workspace.onDidGrantWorkspaceTrust(() => fire('trust')),
		{ dispose: () => clearTimeout(timer) },
	);
}

module.exports = { id: 'changes', activate, fire, listen };

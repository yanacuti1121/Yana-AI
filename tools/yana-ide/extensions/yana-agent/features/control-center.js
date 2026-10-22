'use strict';
// Yana Control Center: một màn chỉ đọc cho thấy trạng thái thật của các phần Yana AI trong thư mục đang mở (Giám Thị,
// runtime, cổng chặn, sandbox, gói hook/skill/agent, khóa lõi, chuỗi audit). Dữ liệu ở control-center-data.js.
// Hai phép kiểm đầy đủ (khóa lõi, chuỗi audit) chạy khi người dùng bấm nút vì chúng có thể ghi vào nhật ký audit.

const vscode = require('vscode');
const crypto = require('node:crypto');
const changes = require('./changes');
const data = require('./control-center-data');
const { binary, workspaceRoot } = require('../cli');
const { runtimeVersion } = require('../runtime');

const VIEW_TYPE = 'yana.controlCenter';

let panel;

async function snapshot() {
	const root = workspaceRoot();
	if (!root) return { error: 'Open a folder first.' };
	const bin = binary();
	return data.collect(root, { binary: bin, version: await runtimeVersion(bin) });
}

async function send(message) {
	panel?.webview.postMessage(message);
}

async function onMessage(msg) {
	if (msg?.type === 'ready' || msg?.type === 'refresh') {
		await send({ type: 'snapshot', snapshot: await snapshot().catch(error => ({ error: error.message })) });
		return;
	}
	if (msg?.type === 'verify' && Object.keys(data.VERIFIERS).includes(msg.kind)) {
		const root = workspaceRoot();
		if (!root) return send({ type: 'verified', kind: msg.kind, label: msg.kind, ok: false, message: 'Open a folder first.' });
		const result = await data.verify(root, msg.kind).catch(error => ({ label: msg.kind, ok: false, message: error.message }));
		await send({ type: 'verified', kind: msg.kind, ...result });
	}
}

function html(webview, media) {
	const nonce = crypto.randomBytes(16).toString('base64');
	const uri = name => webview.asWebviewUri(vscode.Uri.joinPath(media, name));
	const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
	return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('control-center.css')}"><title>Yana Control Center</title></head>
<body><div id="app"><p>Loading…</p></div><script nonce="${nonce}" src="${uri('control-center.js')}"></script></body></html>`;
}

function open(context) {
	if (panel) {
		panel.reveal();
		return;
	}
	const media = vscode.Uri.joinPath(context.extensionUri, 'media');
	panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'Yana Control Center', vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [media] });
	panel.iconPath = vscode.Uri.joinPath(media, 'yana.svg');
	panel.webview.html = html(panel.webview, media);
	panel.webview.onDidReceiveMessage(onMessage);
	panel.onDidDispose(() => { panel = undefined; });
}

function activate(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('yana.controlCenter.open', () => open(context)),
		changes.listen(['config', 'trust', 'governance'], async () => {
			if (panel) await send({ type: 'snapshot', snapshot: await snapshot().catch(error => ({ error: error.message })) });
		}),
	);
}

module.exports = { id: 'control-center', activate };

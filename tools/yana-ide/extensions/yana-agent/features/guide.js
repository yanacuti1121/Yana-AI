'use strict';
// Sách hướng dẫn sử dụng, mở thành một tab trong IDE. Nội dung là media/guide.vi.md (một nguồn duy nhất); media/guide.js
// dựng thành trang có mục lục. Lần đầu dùng app, tab này tự mở cạnh trang chủ một lần để người mới biết bắt đầu từ đâu.

const vscode = require('vscode');
const crypto = require('node:crypto');
const fs = require('node:fs');

const VIEW_TYPE = 'yana.guide';
const SEEN_KEY = 'yana.guide.seen.v1';
const GUIDE_FILE = 'guide.vi.md';
const MAX_GUIDE_BYTES = 512 * 1024; // sách là file của chính ta; giới hạn chỉ để một file hỏng không làm treo webview
const FIRST_RUN_DELAY_MS = 2200; // sau trang chủ (1500 ms) để trang chủ nhận focus, tab sách nằm cạnh

let panel;

function html(webview, media) {
	const nonce = crypto.randomBytes(16).toString('base64');
	const uri = name => webview.asWebviewUri(vscode.Uri.joinPath(media, name));
	const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
	return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('guide.css')}"><title>Yana Guide</title></head>
<body><div id="app"><p>Loading the guide…</p></div><script nonce="${nonce}" src="${uri('guide.js')}"></script></body></html>`;
}

function readGuide(mediaDir) {
	const file = vscode.Uri.joinPath(mediaDir, GUIDE_FILE).fsPath;
	if (fs.statSync(file).size > MAX_GUIDE_BYTES) throw new Error('The guide file is unexpectedly large.');
	return fs.readFileSync(file, 'utf8');
}

function open(context, { preserveFocus = false } = {}) {
	if (panel) {
		panel.reveal(undefined, preserveFocus);
		return;
	}
	const media = vscode.Uri.joinPath(context.extensionUri, 'media');
	panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'Yana Guide', { viewColumn: vscode.ViewColumn.Active, preserveFocus }, { enableScripts: true, localResourceRoots: [media] });
	panel.iconPath = vscode.Uri.joinPath(media, 'yana.svg');
	panel.webview.html = html(panel.webview, media);
	panel.webview.onDidReceiveMessage(message => {
		if (message?.type !== 'ready') return;
		try {
			panel?.webview.postMessage({ type: 'guide', markdown: readGuide(media) });
		} catch (error) {
			vscode.window.showWarningMessage(`Yana: could not load the guide: ${error.message}`);
		}
	});
	panel.onDidDispose(() => { panel = undefined; });
}

function resetFirstRun(context) {
	return context.globalState.update(SEEN_KEY, false);
}

function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('yana.guide.open', () => open(context)));
	if (context.globalState.get(SEEN_KEY)) return;
	if (!vscode.workspace.getConfiguration('yana').get('guide.autoOpen', true)) return; // người dùng đã tắt
	// Chỉ một lần trong đời cài đặt này: đánh dấu ngay để lần khởi động sau không mở lại, dù người dùng đóng tab.
	const timer = setTimeout(() => {
		context.globalState.update(SEEN_KEY, true);
		open(context, { preserveFocus: true });
	}, FIRST_RUN_DELAY_MS);
	context.subscriptions.push({ dispose: () => clearTimeout(timer) });
}

module.exports = { id: 'guide', activate, SEEN_KEY, resetFirstRun };

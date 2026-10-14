'use strict';
// Mở các màn React của app Yana Studio cũ thành tab trong IDE. Mã giao diện là bản đóng gói nguyên vẹn của
// tools/yana-studio/renderer (xem tools/yana-ide/studio-web, build bằng scripts/build-studio-web.sh); dữ liệu đi
// qua cầu nối window.studio (features/studio-bridge.js).

const vscode = require('vscode');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const bridge = require('./studio-bridge');
const { workspaceRoot } = require('../cli');
const { fillTerminal, openToolTerminal } = require('./settings');
const changes = require('./changes');

// entry = khoá của màn trong media/studio/manifest.json (Vite ghi ra khi build, xem studio-web/vite.config.mjs).
const SCREENS = {
	canvas: { title: 'Yana Studio Canvas', entry: 'canvas-entry.tsx' },
	settings: { title: 'Yana Settings', entry: 'settings-entry.tsx' },
	tasks: { title: 'Yana Tasks', entry: 'tasks-entry.tsx' },
	permissions: { title: 'Yana Permissions', entry: 'permissions-entry.tsx' },
};
const IDE_THEME_CSS = 'ide-theme.css'; // luôn nạp cuối để màu theo theme của IDE thắng màu gốc của app cũ
const open = new Map();

// Tên file CSS dùng chung do Vite đặt và đổi khi thêm màn, nên không viết cứng: đọc từ manifest.
// Trả về file JS của màn và danh sách CSS (của màn và của các chunk nó import), không trùng.
function assetsFor(media, entry) {
	const manifestPath = path.join(media.fsPath, 'studio', 'manifest.json');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	if (!manifest[entry]) throw new Error(`Studio screen "${entry}" is missing from ${manifestPath}. Run scripts/build-studio-web.sh.`);
	const css = new Set();
	const seen = new Set();
	const visit = key => {
		if (seen.has(key) || !manifest[key]) return;
		seen.add(key);
		for (const file of manifest[key].css || []) css.add(file);
		for (const child of manifest[key].imports || []) visit(child);
	};
	visit(entry);
	css.delete(IDE_THEME_CSS);
	return { script: manifest[entry].file, css: [...css, IDE_THEME_CSS] };
}

function html(webview, media, screen, root) {
	const nonce = crypto.randomBytes(16).toString('base64');
	const studio = vscode.Uri.joinPath(media, 'studio');
	const assets = assetsFor(media, screen.entry);
	const links = assets.css
		.map(file => `<link rel="stylesheet" href="${webview.asWebviewUri(vscode.Uri.joinPath(studio, file))}">`)
		.join('');
	const js = webview.asWebviewUri(vscode.Uri.joinPath(studio, assets.script));
	const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
	const safeRoot = root.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
	return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${links}<title>${screen.title}</title></head>
<body data-root="${safeRoot}"><div id="app"></div><script type="module" nonce="${nonce}" src="${js}"></script></body></html>`;
}

// onOpenTerminal của màn cũ: không có lệnh → mở terminal trống; lệnh có trong COMMANDS.md → điền sẵn
// (không chạy); còn lại chỉ nhận công cụ ngoài đã cài, như trang Yana Settings trước đây.
async function openTerminal(command) {
	if (!command) {
		vscode.window.createTerminal({ name: 'Yana', cwd: workspaceRoot() || undefined }).show();
		return;
	}
	try {
		fillTerminal(command);
	} catch {
		await openToolTerminal(command);
	}
}

function openScreen(context, id) {
	const screen = SCREENS[id];
	const root = workspaceRoot();
	if (!screen) return;
	if (!root) {
		vscode.window.showWarningMessage('Open a folder first.');
		return;
	}
	if (open.has(id)) {
		open.get(id).reveal(vscode.ViewColumn.One);
		return;
	}
	const media = vscode.Uri.joinPath(context.extensionUri, 'media');
	const panel = vscode.window.createWebviewPanel(`yana.studio.${id}`, screen.title, vscode.ViewColumn.One,
		{ enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] });
	panel.iconPath = vscode.Uri.joinPath(media, 'yana.svg');
	panel.webview.html = html(panel.webview, media, screen, root);
	panel.webview.onDidReceiveMessage(async message => {
		if (await bridge.handle(context, panel.webview, message)) return;
		if (message?.type === 'studio:notice' && message.message) vscode.window.showWarningMessage(`Yana: ${String(message.message).slice(0, 500)}`);
		if (message?.type === 'studio:prompt' && message.prompt) await vscode.commands.executeCommand('yana.chat.prefill', String(message.prompt));
		if (message?.type === 'studio:close') panel.dispose();
		if (message?.type === 'studio:terminal') {
			await openTerminal(String(message.command || '')).catch(error => vscode.window.showWarningMessage(`Yana: ${error.message}`));
		}
	});
	// Báo cho màn nạp lại khi dữ liệu đổi ở nơi khác, và khi tab được mở lại sau lúc bị che (webview giữ trạng thái cũ).
	const notify = kinds => panel.webview.postMessage({ type: 'studio:event', channel: 'yana:changed', value: kinds });
	const subscription = changes.listen(undefined, notify);
	const visibility = panel.onDidChangeViewState(event => event.webviewPanel.visible && notify(['visible']));
	panel.onDidDispose(() => {
		subscription.dispose();
		visibility.dispose();
		open.delete(id);
	});
	open.set(id, panel);
}

function activate(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('yana.studio.canvas', () => openScreen(context, 'canvas')),
		vscode.commands.registerCommand('yana.settings.open', () => openScreen(context, 'settings')),
		vscode.commands.registerCommand('yana.tasks.open', () => openScreen(context, 'tasks')),
		vscode.commands.registerCommand('yana.permissions.open', () => openScreen(context, 'permissions')),
	);
}

module.exports = { id: 'studio-screens', activate };

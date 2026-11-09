'use strict';
// Khu "Start" ở đầu cột Yana: lối vào bấm thẳng cho mọi tính năng (chat, Design Canvas, model, Settings,
// Project Memory, công cụ), để không phải nhớ lệnh trong Command Palette. Giao diện là webview dựng bằng
// component Cline (tools/yana-ide/studio-web/start-screen.tsx). Danh sách lối tắt dưới đây là nguồn duy nhất;
// webview chỉ hiển thị nó, và host chỉ chạy các lệnh có trong danh sách này.
//   web -> host: { type: 'yana:ready' } khi mở, { type: 'yana:run-command', command } khi bấm
//   host -> web: { type: 'yana:start-data', data: { sections, status } }

const vscode = require('vscode');
const crypto = require('node:crypto');
const { runtimeVersion } = require('../runtime');
const { binary, runJson } = require('../cli');
const { assetsFor } = require('./studio-screens');

const START_ENTRY = 'start-entry.tsx'; // khoá của màn trong media/studio/manifest.json
const IDE_THEME_CSS = 'ide-theme.css'; // CSS của các màn cũ; khu Start tự lo nền, không nạp nó
const AUDIT_WINDOW = 500; // khớp statusbar.js và governance.js

const SECTIONS = [
	['Chat', 'comment-discussion', [
		['Yana Home', 'home', 'yana.welcome.open', 'The start page'],
		['User guide', 'book', 'yana.guide.open', 'Step-by-step manual'],
		['Yana IDE settings', 'settings-gear', 'yana.idePreferences.open', 'Guide, approvals, assistant'],
		['Yana Control Center', 'dashboard', 'yana.controlCenter.open', 'Live status of every Yana part'],
		['Open Yana chat', 'comment-discussion', 'yana.focus', 'Right-hand panel. ⌘L'],
		['New conversation', 'add', 'yana.chat.new'],
		['Open a past conversation…', 'history', 'yana.chat.history'],
	]],
	['Design & Office', 'paintcan', [
		['New Design Canvas', 'paintcan', 'yana.canvas.new', 'AI builds screens live; any model'],
		['Open a design canvas…', 'folder-opened', 'yana.canvas.open'],
		['Studio Canvas (component editor)', 'layout', 'yana.studio.canvas', 'From Yana Studio: 22 components, layers, AI edits'],
		['Yana Office (slides & docs)', 'file-pdf', 'yana.office.open', 'Slides, reports, PowerPoint, Word & Excel'],
	]],
	['Models & settings', 'settings-gear', [
		['Choose model', 'sparkle', 'yana.pickModel'],
		['Add an API key', 'key', 'yana.setApiKey'],
		['Yana Settings', 'settings-gear', 'yana.settings.open'],
	]],
	['Project', 'book', [
		['Project Memory', 'book', 'yana.memory.open', 'Sent with every conversation'],
		['Pin a command', 'pinned', 'yana.runCommands.add'],
		['Run a pinned command…', 'play', 'yana.runCommands.pick'],
		['Tasks board', 'tasklist', 'yana.tasks.open', 'Dependencies and evidence'],
		['New task', 'tasklist', 'yana.tasks.create'],
	]],
	['Check & govern', 'shield', [
		['Doctor', 'heart', 'yana.tool.doctor', 'Environment and dependencies'],
		['Scan agent setup', 'search', 'yana.tool.scan'],
		['Permissions', 'shield', 'yana.permissions.open', 'Leases, grant, pending approvals'],
		['Hunt vulnerabilities', 'bug', 'yana.tool.hunt'],
		['Yana commands reference', 'list-unordered', 'yana.commandReference'],
	]],
];

// Dạng webview nhận: { name, actions: [{ id, label, description, value }] }. value là tên lệnh.
const SECTIONS_DATA = SECTIONS.map(([name, , items]) => ({
	name,
	actions: items.map(([label, , command, detail]) => ({ id: command, label, description: detail || '', value: command })),
}));
// Chỉ các lệnh trong danh sách mới được chạy khi webview báo "bấm", dù webview gửi gì lên.
const ALLOWED = new Set(SECTIONS.flatMap(([, , items]) => items.map(item => item[2])));

// Số liệu thật từ yana-rt. Không đọc được thì trả null để webview hiện "unavailable", không điền số giả.
async function readStatus() {
	const bin = binary();
	let runtime = null;
	if (bin) {
		const version = await runtimeVersion(bin).catch(() => null);
		runtime = `yana-rt ${version || '(version unknown)'}`;
	}
	let audit = null;
	try {
		const summary = await runJson(['observability', 'show', '--json', '--last', String(AUDIT_WINDOW)]);
		const decisions = summary?.by_decision || {};
		audit = { allow: decisions.allow || 0, deny: (decisions.deny || 0) + (decisions.block || 0), total: summary?.total ?? 0 };
	} catch {
		audit = null;
	}
	return { editor: `VS Code ${vscode.version}`, runtime, audit };
}

function startHtml(webview, media) {
	const nonce = crypto.randomBytes(16).toString('base64');
	const studio = vscode.Uri.joinPath(media, 'studio');
	const assets = assetsFor(media, START_ENTRY);
	const links = assets.css
		.filter(file => file !== IDE_THEME_CSS)
		.map(file => `<link rel="stylesheet" href="${webview.asWebviewUri(vscode.Uri.joinPath(studio, file))}">`)
		.join('');
	const js = webview.asWebviewUri(vscode.Uri.joinPath(studio, assets.script));
	const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
	return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${links}<title>Yana Start</title></head>
<body><div id="app"></div><script type="module" nonce="${nonce}" src="${js}"></script></body></html>`;
}

class StartView {
	constructor(context) {
		this.context = context;
	}

	resolveWebviewView(view) {
		const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
		view.webview.options = { enableScripts: true, localResourceRoots: [media] };
		view.webview.html = startHtml(view.webview, media);
		const send = async () => view.webview.postMessage({ type: 'yana:start-data', data: { sections: SECTIONS_DATA, status: await readStatus() } });
		const received = view.webview.onDidReceiveMessage(async message => {
			if (message?.type === 'yana:ready') {
				await send();
			} else if (message?.type === 'yana:run-command') {
				const command = String(message.command || '');
				if (!ALLOWED.has(command)) return;
				await vscode.commands.executeCommand(command).then(undefined, error => vscode.window.showWarningMessage(`Yana: ${error.message}`));
			}
		});
		const shown = view.onDidChangeVisibility(() => view.visible && send());
		view.onDidDispose(() => {
			received.dispose();
			shown.dispose();
		});
	}
}

async function openCanvas() {
	const files = await vscode.workspace.findFiles('**/*.yana-canvas.json', '**/node_modules/**', 200);
	if (!files.length) {
		const answer = await vscode.window.showInformationMessage('No design canvas in this project yet.', 'New Design Canvas');
		if (answer) await vscode.commands.executeCommand('yana.canvas.new');
		return;
	}
	const picked = await vscode.window.showQuickPick(
		files.map(uri => ({ label: vscode.workspace.asRelativePath(uri), uri })),
		{ placeHolder: 'Open a design canvas' });
	if (picked) await vscode.commands.executeCommand('vscode.openWith', picked.uri, 'yana.canvas');
}

function activate(context) {
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('yana.home', new StartView(context)),
		vscode.commands.registerCommand('yana.canvas.open', openCanvas),
	);
}

module.exports = { id: 'home', activate, SECTIONS_DATA, ALLOWED };

'use strict';
// Trang chủ Yana ("Yana Home"): tab giữa màn hình, mở khi khởi động nếu chưa có file nào đang mở. Bố cục theo thiết kế
// Stitch yana_studio_welcome_launcher_hub nhưng chỉ có dữ liệu thật: workspace gần đây của IDE, runtime yana-rt, model
// đang chọn và trạng thái key, các máy chủ model local trả lời trên máy này. Không có số liệu mẫu.
// Nút trong trang chỉ chạy các lệnh trong COMMANDS bên dưới (webview gửi id, không gửi tên lệnh tuỳ ý).

const vscode = require('vscode');
const crypto = require('node:crypto');
const { inspectLocalModels } = require('../host/local-models.cjs');
const { binary, workspaceRoot } = require('../cli');
const { runtimeVersion } = require('../runtime');
const models = require('./models');
const changes = require('./changes');

const VIEW_TYPE = 'yana.welcome';
const SETTING = 'showOnStartup';
const MAX_RECENT = 6;
const STARTUP_DELAY_MS = 1500; // chờ VS Code khôi phục các tab của lần trước rồi mới quyết định có mở trang chủ không

const COMMANDS = {
	openFolder: 'workbench.action.files.openFolder',
	clone: 'git.clone',
	recent: 'workbench.action.openRecent',
	canvasNew: 'yana.canvas.new',
	canvasOpen: 'yana.canvas.open',
	canvasStudio: 'yana.studio.canvas',
	chat: 'yana.focus',
	chatNew: 'yana.chat.new',
	chatHistory: 'yana.chat.history',
	tasks: 'yana.tasks.open',
	permissions: 'yana.permissions.open',
	memory: 'yana.memory.open',
	settings: 'yana.settings.open',
	guide: 'yana.guide.open',
	idePreferences: 'yana.idePreferences.open',
	controlCenter: 'yana.controlCenter.open',
	pickModel: 'yana.pickModel',
	setKey: 'yana.setApiKey',
	doctor: 'yana.tool.doctor',
	scan: 'yana.tool.scan',
	hunt: 'yana.tool.hunt',
	sidebar: 'workbench.view.extension.yana-explorer',
};

let panel;

// Workspace gần đây từ chính IDE. Lệnh nội bộ `_workbench.getRecentlyOpened` không có trong API công khai; nếu nó
// không còn thì danh sách để trống và nút "Open Recent…" vẫn dùng được.
async function recentFolders() {
	try {
		const recent = await vscode.commands.executeCommand('_workbench.getRecentlyOpened');
		return (recent?.workspaces || [])
			.filter(entry => entry.folderUri?.scheme === 'file')
			.slice(0, MAX_RECENT)
			.map(entry => ({ path: entry.folderUri.fsPath, name: entry.folderUri.path.split('/').pop() || entry.folderUri.fsPath }));
	} catch {
		return [];
	}
}

async function status() {
	const bin = binary();
	const cfg = vscode.workspace.getConfiguration('yana');
	const provider = cfg.get('provider', 'ollama');
	const info = models.info(provider);
	const keyed = models.needsKey(provider) ? Boolean(await models.keyFor(provider)) : null;
	const [version, local] = await Promise.all([
		runtimeVersion(bin),
		inspectLocalModels(fetch, () => '').catch(() => []),
	]);
	return {
		runtime: { found: Boolean(bin), version },
		model: { provider: info?.label || provider, model: cfg.get('model', '') || 'provider default', keyed },
		local: local.map(entry => ({ name: entry.name, endpoint: entry.endpoint, ready: entry.status === 'ready', models: entry.models.length })),
		folder: workspaceRoot() ? workspaceRoot().split('/').pop() : '',
		recent: await recentFolders(),
	};
}

function html(webview, media) {
	const nonce = crypto.randomBytes(16).toString('base64');
	const uri = name => webview.asWebviewUri(vscode.Uri.joinPath(media, name));
	const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource};`;
	return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('welcome.css')}"><title>Yana Home</title></head>
<body data-emblem="${uri('yana-emblem.svg')}"><div id="app"></div><script nonce="${nonce}" src="${uri('welcome.js')}"></script></body></html>`;
}

async function onMessage(msg, webview) {
	if (msg?.type === 'ready' || msg?.type === 'refresh') {
		webview.postMessage({ type: 'status', status: await status() });
	} else if (msg?.type === 'run' && Object.hasOwn(COMMANDS, msg.id)) {
		await vscode.commands.executeCommand(COMMANDS[msg.id]);
	} else if (msg?.type === 'openFolder' && typeof msg.path === 'string') {
		const known = (await recentFolders()).some(entry => entry.path === msg.path);
		if (known) await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.path));
	} else if (msg?.type === 'showOnStartup') {
		await vscode.workspace.getConfiguration('yana.welcome').update(SETTING, msg.value === true, vscode.ConfigurationTarget.Global);
	}
}

function open(context) {
	if (panel) {
		panel.reveal(vscode.ViewColumn.One);
		return;
	}
	const media = vscode.Uri.joinPath(context.extensionUri, 'media');
	panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'Yana Home', vscode.ViewColumn.One, { enableScripts: true, localResourceRoots: [media] });
	panel.iconPath = vscode.Uri.joinPath(media, 'yana.svg');
	panel.webview.html = html(panel.webview, media);
	panel.webview.onDidReceiveMessage(msg => onMessage(msg, panel.webview).catch(error => vscode.window.showWarningMessage(`Yana: ${error.message}`)));
	const refresh = () => status().then(value => panel?.webview.postMessage({ type: 'status', status: value })).catch(() => undefined);
	const subscription = changes.listen(['config', 'secrets', 'trust'], refresh);
	const visibility = panel.onDidChangeViewState(event => event.webviewPanel.visible && refresh());
	panel.onDidDispose(() => {
		subscription.dispose();
		visibility.dispose();
		panel = undefined;
	});
}

function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('yana.welcome.open', () => open(context)));
	if (!vscode.workspace.getConfiguration('yana.welcome').get(SETTING, true)) return;
	// Một lần sau khi khởi động: chỉ mở khi không có tab nào (VS Code đã khôi phục xong), để không chen vào công việc đang dở.
	const timer = setTimeout(() => {
		if (vscode.window.tabGroups.all.every(group => group.tabs.length === 0)) open(context);
	}, STARTUP_DELAY_MS);
	context.subscriptions.push({ dispose: () => clearTimeout(timer) });
}

module.exports = { id: 'welcome', activate };

'use strict';
// Màn "Yana IDE": chỗ chỉnh các tính năng riêng của IDE (sách hướng dẫn, trang chủ, trợ lý mặc định, duyệt hành động).
// Cạnh Settings của app cũ chứ không nằm trong đó, vì màn đó là React dùng chung với app Electron. Chỉ có công tắc
// đang chạy thật; thứ chưa có thì ghi rõ "Not available yet" (xem PLANNED), không dựng công tắc giả.

const vscode = require('vscode');
const crypto = require('node:crypto');
const approvals = require('./approval-store');
const changes = require('./changes');
const guide = require('./guide');
const { binary, workspaceRoot } = require('../cli');
const { supportsTurnControls } = require('../runtime');
const { parseMaxTokens, parseTemperature } = require('./chat-controls');
const { getActiveLanguage } = require('./language');

const VIEW_TYPE = 'yana.idePreferences';

// Chưa có phần chạy bên trong nên không có công tắc. Danh sách này hiện nguyên văn trên màn.
const PLANNED = [
	['Voice input', 'No speech runtime is configured yet.'],
	['Reasoning effort', 'Not tunable yet: whether a model accepts it differs per provider and model.'],
	['Discord remote chat', 'The installed yana-rt has no remote command, and no bot token is set.'],
];

let panel;

async function assistants() {
	try {
		return await vscode.commands.executeCommand('yana.assistants.get') || { items: [], selectedId: '' };
	} catch {
		return { items: [], selectedId: '' };
	}
}

async function state(context) {
	const cfg = vscode.workspace.getConfiguration('yana');
	const root = workspaceRoot();
	const { items, selectedId } = await assistants();
	const lang = getActiveLanguage();
	return {
		language: lang,
		guide: { autoOpen: cfg.get('guide.autoOpen', true), seen: Boolean(context.globalState.get(guide.SEEN_KEY)) },
		home: { showOnStartup: cfg.get('welcome.showOnStartup', true) },
		approvals: { hasFolder: Boolean(root), trusted: vscode.workspace.isTrusted, active: root ? approvals.isActive(root) : false },
		assistants: { items: items.map(({ id, name, description, provider, model }) => ({ id, name, description, provider, model })), selectedId },
		runtime: { path: binary() || '', provider: cfg.get('provider', ''), model: cfg.get('model', '') },
		chat: { maxTokens: cfg.get('chat.maxTokens', null), temperature: cfg.get('chat.temperature', null), controlsSupported: await supportsTurnControls(binary()) },
		planned: PLANNED,
	};
}


async function setConfig(key, value) {
	await vscode.workspace.getConfiguration('yana').update(key, value, vscode.ConfigurationTarget.Global);
	changes.fire('config');
}

async function enableApprovals() {
	const root = workspaceRoot();
	if (!root) throw new Error('Open a folder first.');
	if (!vscode.workspace.isTrusted) throw new Error('This folder is in Restricted Mode. Trust it first.');
	const answer = await vscode.window.showWarningMessage(
		'Turn on approvals in this project? This adds one small file (.claude/state/locking-protocol-version).',
		{ modal: true }, 'Turn on');
	if (answer !== 'Turn on') return;
	approvals.enable(root);
	changes.fire('governance');
}

// Hành động webview được phép gọi; tham số được kiểm tra lại ở đây.
const ACTIONS = {
	setGuideAutoOpen: (_c, msg) => setConfig('guide.autoOpen', msg.value === true),
	showGuideAgain: context => guide.resetFirstRun(context),
	openGuide: () => vscode.commands.executeCommand('yana.guide.open'),
	setHomeOnStartup: (_c, msg) => setConfig('welcome.showOnStartup', msg.value === true),
	enableApprovals,
	selectAssistant: async (_c, msg) => {
		const { items } = await assistants();
		if (typeof msg.id !== 'string' || !items.some(item => item.id === msg.id)) throw new Error('Unknown assistant');
		await vscode.commands.executeCommand('yana.assistants.select', msg.id);
		changes.fire('config');
	},
	setMaxTokens: (_c, msg) => setConfig('chat.maxTokens', parseMaxTokens(msg.value)),
	setTemperature: (_c, msg) => setConfig('chat.temperature', parseTemperature(msg.value)),
	openModels: () => vscode.commands.executeCommand('yana.modelsRuntime.open'),
	openSettings: () => vscode.commands.executeCommand('yana.settings.open'),
};

async function onMessage(context, msg) {
	if (msg?.type === 'ready') {
		panel?.webview.postMessage({ type: 'state', state: await state(context) });
		return;
	}
	const action = ACTIONS[msg?.type];
	if (!action) return;
	try {
		await action(context, msg);
		panel?.webview.postMessage({ type: 'state', state: await state(context) });
	} catch (error) {
		panel?.webview.postMessage({ type: 'error', message: error.message });
	}
}

function html(webview, media) {
	const nonce = crypto.randomBytes(16).toString('base64');
	const uri = name => webview.asWebviewUri(vscode.Uri.joinPath(media, name));
	const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
	const lang = getActiveLanguage();
	const title = lang === 'vi' ? 'Cài đặt IDE Yana' : lang === 'ko' ? 'Yana IDE 기본 설정' : 'Yana IDE Settings';
	return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('ide-preferences.css')}"><title>${title}</title></head>
<body><div id="app"><p>Loading…</p></div><script nonce="${nonce}" src="${uri('ide-preferences.js')}"></script></body></html>`;
}

function open(context) {
	if (panel) {
		panel.reveal();
		return;
	}
	const media = vscode.Uri.joinPath(context.extensionUri, 'media');
	const lang = getActiveLanguage();
	const title = lang === 'vi' ? 'Cài đặt IDE Yana' : lang === 'ko' ? 'Yana IDE 기본 설정' : 'Yana IDE Settings';
	panel = vscode.window.createWebviewPanel(VIEW_TYPE, title, vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [media] });
	panel.iconPath = vscode.Uri.joinPath(media, 'yana.svg');
	panel.webview.html = html(panel.webview, media);
	panel.webview.onDidReceiveMessage(msg => onMessage(context, msg));
	panel.onDidDispose(() => { panel = undefined; });
}

function activate(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('yana.idePreferences.open', () => open(context)),
		// Giá trị đổi ở nơi khác (Cmd+, , chat chọn trợ lý, trust) thì màn tự nạp lại.
		changes.listen(['config', 'trust', 'governance'], async () => {
			if (panel) panel.webview.postMessage({ type: 'state', state: await state(context) });
		}),
		vscode.workspace.onDidChangeConfiguration(async event => {
			if (event.affectsConfiguration('yana.language')) {
				const lang = getActiveLanguage();
				if (panel) {
					panel.title = lang === 'vi' ? 'Cài đặt IDE Yana' : lang === 'ko' ? 'Yana IDE 기본 설정' : 'Yana IDE Settings';
					panel.webview.postMessage({ type: 'state', state: await state(context) });
				}
			}
		})
	);
}

module.exports = { id: 'ide-preferences', activate };


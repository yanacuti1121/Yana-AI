'use strict';
// Trang Yana Settings mở trong vùng editor (như Settings của VS Code). Bố cục theo thiết kế Stitch,
// dữ liệu từ settings-data.js. Mọi hành động từ webview được kiểm tra lại ở đây trước khi chạy.

const vscode = require('vscode');
const crypto = require('node:crypto');
const { publicCatalog } = require('../host/model-catalog.cjs');
const { endpoint } = require('../host/local-models.cjs');
const { discoverModels } = require('../host/model-discovery.cjs');
const { commandReference, systemOverview } = require('../host/system-surfaces.cjs');
const { binary, workspaceRoot } = require('../cli');
const models = require('./models');
const data = require('./settings-data');
const { getActiveLanguage, applyLanguage } = require('./language');

const TABS = ['account', 'general', 'appearance', 'models', 'customizations', 'browser', 'tab', 'editor', 'usage', 'connections', 'permissions', 'tools', 'commands', 'data'];
const MAX_MODEL_ID = 200;

let panel;
let pendingTab = 'models';

function isProvider(id) {
	return publicCatalog().some(provider => provider.id === id);
}

function validModelId(value) {
	return typeof value === 'string' && value.length <= MAX_MODEL_ID && !/[\r\n\0]/.test(value);
}

async function setActive(provider, model) {
	if (!isProvider(provider) || !validModelId(model)) throw new Error('Invalid provider or model ID');
	const cfg = vscode.workspace.getConfiguration('yana');
	await cfg.update('provider', provider, vscode.ConfigurationTarget.Global);
	await cfg.update('model', model.trim(), vscode.ConfigurationTarget.Global);
}

async function setBaseUrl(value) {
	await vscode.workspace.getConfiguration('yana').update('baseUrl', value ? endpoint(value) : '', vscode.ConfigurationTarget.Global);
}

async function pickRuntime() {
	const picked = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Use this yana-rt' });
	if (picked?.[0]) await vscode.workspace.getConfiguration('yana').update('runtimePath', picked[0].fsPath, vscode.ConfigurationTarget.Global);
}

async function syncModels(provider) {
	if (!isProvider(provider)) throw new Error('Invalid provider');
	const baseUrl = provider === 'custom' ? vscode.workspace.getConfiguration('yana').get('baseUrl', '') : '';
	return discoverModels(provider, baseUrl, await models.keyFor(provider));
}

function fillTerminal(command) {
	const known = commandReference(workspaceRoot()).commands.some(entry => entry.command === command);
	if (!known) throw new Error('Command is not listed in COMMANDS.md');
	const terminal = vscode.window.activeTerminal || vscode.window.createTerminal({ name: 'Yana', cwd: workspaceRoot() || undefined });
	terminal.show();
	terminal.sendText(command, false);
}

async function openToolTerminal(command) {
	const overview = await systemOverview({ runtime: binary(), projectRoot: workspaceRoot() });
	const tool = overview.externalTools.find(entry => entry.command === command && entry.available);
	if (!tool) {
		vscode.window.showWarningMessage(`Tool '${command}' is not installed or not available on PATH.`);
		throw new Error('Tool is not installed on this machine');
	}
	const terminal = vscode.window.createTerminal({ name: tool.label, cwd: workspaceRoot() || undefined });
	terminal.show(true);
	const runCmd = tool.path ? `"${tool.path}"` : tool.command;
	terminal.sendText(runCmd);
}

async function updateSetting(section, key, value) {
	const allowed = ['editor', 'diffEditor', 'files', 'telemetry', 'explorer', 'yana'];
	if (!allowed.includes(section)) throw new Error('Disallowed configuration section');
	await vscode.workspace.getConfiguration(section).update(key, value, vscode.ConfigurationTarget.Global);
}

// Hành động webview được phép gọi. Tham số luôn được kiểm tra lại, không tin dữ liệu từ webview.
const ACTIONS = {
	setActive: msg => setActive(String(msg.provider), String(msg.model || '')),
	setBaseUrl: msg => setBaseUrl(String(msg.value || '')),
	syncModels: msg => syncModels(String(msg.provider)),
	setKey: msg => isProvider(msg.provider) && vscode.commands.executeCommand('yana.setApiKey', String(msg.provider)),
	removeKey: msg => isProvider(msg.provider) && vscode.commands.executeCommand('yana.models.removeKey', { providerId: String(msg.provider) }),
	pickRuntime,
	revokeLease: msg => typeof msg.id === 'string' && vscode.commands.executeCommand('yana.governance.revokeLease', { leaseId: msg.id }),
	useYanaTheme: () => vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Yana Dark', vscode.ConfigurationTarget.Global),
	useYanaWebTheme: () => vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Yana Web (vutam.link)', vscode.ConfigurationTarget.Global),
	useYanaLightTheme: () => vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Yana Light', vscode.ConfigurationTarget.Global),
	useYanaHcTheme: () => vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Yana High Contrast', vscode.ConfigurationTarget.Global),
	pickTheme: () => vscode.commands.executeCommand('workbench.action.selectTheme'),
	pickLanguage: () => vscode.commands.executeCommand('workbench.action.configureLocale'),
	setLanguage: async msg => {
		await applyLanguage(String(msg.lang || 'en'));
		panel?.webview.postMessage({ type: 'languageChanged', language: msg.lang });
		if (panel) {
			panel.title = msg.lang === 'vi' ? 'Cài đặt Yana' : msg.lang === 'ko' ? 'Yana 설정' : 'Yana Settings';
		}
	},
	copy: msg => vscode.env.clipboard.writeText(String(msg.text || '').slice(0, 2000)),
	fillTerminal: msg => fillTerminal(String(msg.command || '')),
	openToolTerminal: msg => openToolTerminal(String(msg.command || '')),
	openMemory: () => vscode.commands.executeCommand('yana.memory.open'),
	openChat: () => vscode.commands.executeCommand('yana.focus'),
	openKeybindings: () => vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'yana'),
	updateSetting: msg => updateSetting(String(msg.section), String(msg.key), msg.value),
	openShortcuts: () => vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'yana'),
	provideFeedback: () => vscode.env.openExternal(vscode.Uri.parse('https://github.com/yanacuti1121/Yana-AI/issues')),
};

async function onMessage(context, msg) {
	if (msg?.type === 'ready') {
		const lang = getActiveLanguage();
		panel?.webview.postMessage({ type: 'init', language: lang, tab: pendingTab });
		return;
	}
	if (msg?.type === 'load' && TABS.concat('local').includes(msg.tab)) {
		const payload = await data.load(msg.tab, context).catch(error => ({ error: error.message }));
		panel?.webview.postMessage({ type: 'data', tab: msg.tab, payload });
		return;
	}
	const action = ACTIONS[msg?.type];
	if (!action) return;
	try {
		const result = await action(msg);
		panel?.webview.postMessage({ type: 'result', requestId: msg.requestId, ok: true, result: Array.isArray(result) ? result : undefined });
	} catch (error) {
		vscode.window.showErrorMessage(error.message);
		panel?.webview.postMessage({ type: 'result', requestId: msg.requestId, ok: false, error: error.message });
	}
}

function html(webview, media) {
	const nonce = crypto.randomBytes(16).toString('base64');
	const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'settings.css'));
	const scripts = ['settings.js', 'settings-models.js', 'settings-tabs.js']
		.map(name => `<script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(media, name))}"></script>`).join('');
	const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource};`;
	const lang = getActiveLanguage();
	const title = lang === 'vi' ? 'Cài đặt Yana' : lang === 'ko' ? 'Yana 설정' : 'Yana Settings';
	return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}"><title>${title}</title></head>
<body><div id="app"></div>${scripts}</body></html>`;
}

function open(context, tab) {
	const initial = TABS.includes(tab) ? tab : 'models';
	if (panel) {
		panel.reveal();
		panel.webview.postMessage({ type: 'select', tab: initial });
		return;
	}
	const media = vscode.Uri.joinPath(context.extensionUri, 'media');
	const lang = getActiveLanguage();
	const title = lang === 'vi' ? 'Cài đặt Yana' : lang === 'ko' ? 'Yana 설정' : 'Yana Settings';
	panel = vscode.window.createWebviewPanel('yana.settings', title, vscode.ViewColumn.Active,
		{ enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] });
	panel.iconPath = vscode.Uri.joinPath(media, 'yana.svg');
	panel.webview.html = html(panel.webview, media);
	pendingTab = initial; // webview gửi 'ready' khi script đã chạy, lúc đó mới chọn tab
	panel.webview.onDidReceiveMessage(msg => onMessage(context, msg));
	panel.onDidDispose(() => { panel = undefined; });
	panel.reveal(vscode.ViewColumn.One);
}

function activate(context) {
	const refresh = () => panel?.webview.postMessage({ type: 'refresh' });
	context.subscriptions.push(
		vscode.commands.registerCommand('yana.settings.open', tab => open(context, typeof tab === 'string' ? tab : 'models')),
		vscode.commands.registerCommand('yana.account.open', () => open(context, 'account')),
		vscode.commands.registerCommand('yana.models.open', () => open(context, 'models')),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('yana.language')) {
				const lang = getActiveLanguage();
				if (panel) {
					panel.title = lang === 'vi' ? 'Cài đặt Yana' : lang === 'ko' ? 'Yana 설정' : 'Yana Settings';
					panel.webview.postMessage({ type: 'languageChanged', language: lang });
				}
			}
			if (event.affectsConfiguration('yana') || event.affectsConfiguration('workbench.colorTheme')) {
				refresh();
			}
		}),
		context.secrets.onDidChange(refresh),
	);
	if (process.env.YANA_OPEN_SETTINGS === '1') {
		setTimeout(() => open(context, 'models'), 2500);
	}
}

module.exports = { id: 'settings', activate, fillTerminal, openToolTerminal };

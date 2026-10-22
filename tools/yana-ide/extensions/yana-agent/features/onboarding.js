'use strict';
// Tính năng Hướng dẫn mở đầu (First-Launch Onboarding Walkthrough) cho Yana Studio.
// Mở tự động khi người dùng cài đặt / khởi động IDE lần đầu, cho phép đi qua các bước:
// 1. Chào mừng & chọn ngôn ngữ
// 2. Chọn chế độ Agent (Giám thị / Lập kế hoạch / Tự chủ)
// 3. Chọn mô hình AI (Cục bộ Ollama / Cloud API / Sau)
// 4. Bắt đầu & mở dự án

const vscode = require('vscode');
const crypto = require('node:crypto');
const { applyLanguage, getActiveLanguage } = require('./language');

const VIEW_TYPE = 'yana.onboarding';
const ONBOARDING_COMPLETED_KEY = 'yana.onboardingCompleted';
const STARTUP_DELAY_MS = 1200;

let panel;

function html(webview, media) {
	const nonce = crypto.randomBytes(16).toString('base64');
	const uri = name => webview.asWebviewUri(vscode.Uri.joinPath(media, name));
	const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource};`;
	return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('onboarding.css')}"><title>Chào mừng bạn đến với Yana Studio</title></head>
<body data-emblem="${uri('yana-emblem.svg')}" data-logo="${uri('yana.svg')}"><div id="app"></div><script nonce="${nonce}" src="${uri('onboarding.js')}"></script></body></html>`;
}

async function getState() {
	const cfg = vscode.workspace.getConfiguration('yana');
	return {
		language: getActiveLanguage(),
		mode: cfg.get('mode', 'supervised'),
		provider: cfg.get('provider', 'ollama'),
		model: cfg.get('model', ''),
		completed: false
	};
}

async function onMessage(msg, webview, context) {
	if (msg?.type === 'ready') {
		webview.postMessage({ type: 'state', state: await getState() });
	} else if (msg?.type === 'setLanguage' && typeof msg.lang === 'string') {
		await applyLanguage(msg.lang);
		webview.postMessage({ type: 'state', state: await getState() });
	} else if (msg?.type === 'setMode' && typeof msg.mode === 'string') {
		await vscode.workspace.getConfiguration('yana').update('mode', msg.mode, vscode.ConfigurationTarget.Global);
	} else if (msg?.type === 'setProvider' && typeof msg.provider === 'string') {
		await vscode.workspace.getConfiguration('yana').update('provider', msg.provider, vscode.ConfigurationTarget.Global);
	} else if (msg?.type === 'finish') {
		await context.globalState.update(ONBOARDING_COMPLETED_KEY, true);
		if (panel) {
			panel.dispose();
		}
		if (msg.action === 'openFolder') {
			await vscode.commands.executeCommand('workbench.action.files.openFolder');
		} else if (msg.action === 'chat') {
			await vscode.commands.executeCommand('yana.focus');
		} else {
			await vscode.commands.executeCommand('yana.welcome.open');
		}
	} else if (msg?.type === 'skip') {
		await context.globalState.update(ONBOARDING_COMPLETED_KEY, true);
		if (panel) {
			panel.dispose();
		}
		await vscode.commands.executeCommand('yana.welcome.open');
	}
}

function open(context) {
	if (panel) {
		panel.reveal(vscode.ViewColumn.One);
		return;
	}
	const media = vscode.Uri.joinPath(context.extensionUri, 'media');
	panel = vscode.window.createWebviewPanel(
		VIEW_TYPE,
		'Chào mừng đến với Yana Studio',
		vscode.ViewColumn.One,
		{ enableScripts: true, localResourceRoots: [media], retainContextWhenHidden: true }
	);
	panel.iconPath = vscode.Uri.joinPath(media, 'yana.svg');
	panel.webview.html = html(panel.webview, media);
	panel.webview.onDidReceiveMessage(msg => onMessage(msg, panel.webview, context).catch(err => vscode.window.showWarningMessage(`Yana Onboarding: ${err.message}`)));
	panel.onDidDispose(() => {
		panel = undefined;
	});
}

function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('yana.onboarding.open', () => open(context)));
	
	// Tự động mở khi cài đặt / khởi chạy lần đầu nếu chưa hoàn thành
	const completed = context.globalState.get(ONBOARDING_COMPLETED_KEY, false);
	if (!completed) {
		const timer = setTimeout(() => {
			open(context);
		}, STARTUP_DELAY_MS);
		context.subscriptions.push({ dispose: () => clearTimeout(timer) });
	}
}

module.exports = { id: 'onboarding', activate, open, ONBOARDING_COMPLETED_KEY };

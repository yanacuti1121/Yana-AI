'use strict';
// Design Canvas kiểu Stitch: mở file *.yana-canvas.json như một tab editor. Chọn model bất kỳ, mô tả
// màn hình bằng chat, xem AI dựng giao diện trực tiếp trong khung xem trước, tạo phương án khác, sửa
// tiếp bằng chat, xuất ra HTML. Lưu, hoàn tác (Cmd+Z) và đánh dấu chưa lưu do IDE lo, vì mọi thay đổi
// đi qua WorkspaceEdit trên chính file JSON.

const vscode = require('vscode');
const crypto = require('node:crypto');
const { startTurn } = require('../runtime');
const { binary, workspaceRoot } = require('../cli');
const { scanProjectTokens } = require('../host/design-tokens.cjs');
const { systemPrompt, buildTask, extractHtml, sandboxDir } = require('./canvas-ai');
const models = require('./models');

const VIEW_TYPE = 'yana.canvas';
const MAX_SCREENS = 30;
const MAX_CHAT = 200;

function emptyDocument(title) {
	return { version: 1, title, provider: '', model: '', screens: [], chat: [] };
}

function parse(document) {
	try {
		const value = JSON.parse(document.getText() || '{}');
		return {
			...emptyDocument(value.title || 'Untitled canvas'),
			...value,
			screens: Array.isArray(value.screens) ? value.screens : [],
			chat: Array.isArray(value.chat) ? value.chat : [],
		};
	} catch {
		return null;
	}
}

async function write(document, data) {
	const edit = new vscode.WorkspaceEdit();
	const all = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
	edit.replace(document.uri, all, JSON.stringify(data, null, '\t') + '\n');
	await vscode.workspace.applyEdit(edit);
}

class CanvasEditor {
	constructor(context) {
		this.context = context;
	}

	resolveCustomTextEditor(document, panel) {
		const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
		panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
		panel.webview.html = this.html(panel.webview, media);
		const session = { document, panel, run: undefined };
		const post = message => panel.webview.postMessage(message);
		// Gửi kèm provider nào đã có key, để canvas hiện "Key saved" đúng thực tế (không bao giờ gửi key).
		const sync = async () => post({ type: 'document', data: parse(document), providers: await providerList() });
		const changeSub = vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.uri.toString() === document.uri.toString()) sync();
		});
		const keySub = this.context.secrets.onDidChange(() => sync());
		panel.onDidDispose(() => {
			changeSub.dispose();
			keySub.dispose();
			session.run?.stop();
		});
		panel.webview.onDidReceiveMessage(message => this.onMessage(session, message, sync).catch(error => post({ type: 'gen-error', message: error.message })));
	}

	async onMessage(session, message, sync) {
		const { document } = session;
		const data = parse(document);
		switch (message?.type) {
			case 'ready': return sync();
			case 'setModel': {
				if (!data || !models.info(String(message.provider))) return undefined;
				return write(document, { ...data, provider: String(message.provider), model: String(message.model || '').trim().slice(0, 200) });
			}
			case 'generate': return this.generate(session, data, message);
			case 'stop': session.run?.stop(); return undefined;
			case 'deleteScreen': return write(document, { ...data, screens: data.screens.filter(s => s.id !== message.id) });
			case 'renameScreen': {
				const name = String(message.name || '').trim().slice(0, 80);
				if (!name) return undefined;
				return write(document, { ...data, screens: data.screens.map(s => (s.id === message.id ? { ...s, name } : s)) });
			}
			case 'export': return this.exportScreen(document, data.screens.find(s => s.id === message.id));
			case 'setKey': return vscode.commands.executeCommand('yana.setApiKey', String(message.provider || ''));
			default: return undefined;
		}
	}

	async preflight(data) {
		const bin = binary();
		if (!bin) throw new Error('yana-rt not found. Set yana.runtimePath in settings.');
		const provider = data.provider || vscode.workspace.getConfiguration('yana').get('provider', 'ollama');
		const model = data.provider ? data.model : vscode.workspace.getConfiguration('yana').get('model', '');
		if (!models.info(provider)) throw new Error(`Provider "${provider}" is not in the yana-rt catalog.`);
		const key = await models.keyFor(provider);
		if (models.needsKey(provider) && !key) throw new Error(`No API key for ${provider}. Add one with the key button.`);
		return { bin, provider, model, key };
	}

	async generate(session, data, message) {
		if (session.run) throw new Error('A screen is already being generated. Stop it first.');
		if (!data) throw new Error('This canvas file is not valid JSON.');
		const mode = ['new', 'variant', 'refine'].includes(message.mode) ? message.mode : 'new';
		const base = data.screens.find(s => s.id === message.screenId);
		const device = message.device === 'phone' ? 'phone' : 'desktop';
		const instruction = mode === 'variant' && base ? base.prompt : String(message.instruction || '');
		const task = buildTask({ mode, instruction, device: base?.device || device, currentHtml: base?.html });
		const ready = await this.preflight(data);
		const root = workspaceRoot();
		const payload = { task, system: systemPrompt(root ? scanProjectTokens(root) : {}), history: [], session_id: `canvas-${crypto.randomUUID()}` };
		if (ready.key) payload.api_key = ready.key;
		if (ready.provider === 'custom') {
			payload.base_url = vscode.workspace.getConfiguration('yana').get('baseUrl', '');
			payload.custom_keyless = !ready.key;
		}
		const post = msg => session.panel.webview.postMessage(msg);
		post({ type: 'gen-start', mode, screenId: base?.id || '', model: `${models.info(ready.provider)?.label || ready.provider} · ${ready.model || 'default'}` });
		let output = '';
		let failure = '';
		session.run = startTurn(
			{ binary: ready.bin, cwd: sandboxDir(this.context.globalStorageUri.fsPath), provider: ready.provider, model: ready.model, resume: false, payload },
			event => {
				if (event.type === 'text_delta') {
					output += event.text || '';
					post({ type: 'delta', text: event.text || '' });
				} else if (event.type === 'awaiting_approval' || (event.type === 'runtime_event' && event.kind === 'tool_requested')) {
					failure = 'The model tried to use a tool instead of returning a design. Try again or pick another model.';
					session.run?.stop();
				} else if (event.type === 'error') {
					failure = event.message || 'Runtime error';
				} else if (event.type === 'completed' && !output && event.message) {
					output = event.message;
				}
			},
			() => {
				session.run = undefined;
				this.finish(session, { mode, base, device, instruction, output, failure }).catch(error => post({ type: 'gen-error', message: error.message }));
			},
		);
	}

	async finish(session, { mode, base, device, instruction, output, failure }) {
		const post = msg => session.panel.webview.postMessage(msg);
		const html = extractHtml(output);
		if (failure || !html) {
			post({ type: 'gen-error', message: failure || 'The model returned no HTML. Try again or pick another model.' });
			return;
		}
		const data = parse(session.document);
		const now = Date.now();
		const chat = [...data.chat, { role: 'user', content: instruction, mode, at: now }].slice(-MAX_CHAT);
		let screens;
		let screenId;
		if (mode === 'refine' && base) {
			screenId = base.id;
			screens = data.screens.map(s => (s.id === base.id ? { ...s, html, updatedAt: now } : s));
		} else {
			screenId = crypto.randomUUID();
			const name = `${mode === 'variant' ? 'Variant' : 'Screen'} ${data.screens.length + 1}`;
			screens = [...data.screens, { id: screenId, name, device: base?.device || device, prompt: instruction, html, createdAt: now, updatedAt: now }].slice(-MAX_SCREENS);
		}
		await write(session.document, { ...data, screens, chat });
		post({ type: 'gen-done', screenId });
	}

	async exportScreen(document, screen) {
		if (!screen) return;
		const folder = vscode.Uri.joinPath(document.uri, '..');
		const safe = screen.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'screen';
		const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(folder, `${safe}.html`), filters: { HTML: ['html'] }, saveLabel: 'Export screen' });
		if (!target) return;
		await vscode.workspace.fs.writeFile(target, Buffer.from(screen.html, 'utf8'));
		vscode.window.showInformationMessage(`Exported ${screen.name} to ${vscode.workspace.asRelativePath(target)}.`);
	}

	html(webview, media) {
		const nonce = crypto.randomBytes(16).toString('base64');
		const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'canvas.css'));
		const ui = webview.asWebviewUri(vscode.Uri.joinPath(media, 'canvas-ui.js'));
		const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'canvas.js'));
		// style-src 'unsafe-inline' và img-src data: chỉ để khung xem trước (iframe srcdoc, sandbox không
		// cho chạy script) hiển thị được CSS và SVG mà model viết. Script vẫn chỉ chạy theo nonce, không có
		// mạng (default-src 'none'), nên HTML do model sinh ra không chạy mã hay gửi dữ liệu đi đâu được.
		const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; script-src 'nonce-${nonce}'; frame-src 'self' about: data:;`;
		return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}"><title>Design Canvas</title></head>
<body data-emblem="${webview.asWebviewUri(vscode.Uri.joinPath(media, 'yana-emblem.svg'))}"><div id="app"></div><script nonce="${nonce}" src="${ui}"></script><script nonce="${nonce}" src="${js}"></script></body></html>`;
	}
}

async function providerList() {
	const catalog = require('../host/model-catalog.cjs').publicCatalog();
	return Promise.all(catalog.map(async p => ({
		id: p.id, label: p.label, kind: p.kind, defaultModel: p.defaultModel, models: p.modelCatalog.map(m => m.id),
		needsKey: Boolean(p.requiresKey), keyed: Boolean(await models.keyFor(p.id)),
	})));
}

async function newCanvas() {
	const root = workspaceRoot();
	if (!root) {
		vscode.window.showWarningMessage('Open a folder before creating a design canvas.');
		return;
	}
	const target = await vscode.window.showSaveDialog({
		defaultUri: vscode.Uri.joinPath(vscode.Uri.file(root), 'design', 'untitled.yana-canvas.json'),
		filters: { 'Yana Canvas': ['yana-canvas.json'] },
		saveLabel: 'Create canvas',
	});
	if (!target) return;
	const title = target.path.split('/').pop().replace(/\.yana-canvas\.json$/, '');
	await vscode.workspace.fs.writeFile(target, Buffer.from(JSON.stringify(emptyDocument(title), null, '\t') + '\n', 'utf8'));
	await vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE);
}

function activate(context) {
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(VIEW_TYPE, new CanvasEditor(context), { webviewOptions: { retainContextWhenHidden: false } }),
		vscode.commands.registerCommand('yana.canvas.new', newCanvas),
	);
}

module.exports = { id: 'canvas', activate };

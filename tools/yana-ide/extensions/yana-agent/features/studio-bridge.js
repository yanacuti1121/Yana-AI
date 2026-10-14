'use strict';
// Phía extension của cầu nối window.studio (tools/yana-ide/studio-web/bridge.ts). Các màn React của app
// Yana Studio cũ gọi window.studio.<hàm>(...); ở đây mỗi hàm được nối lại vào đúng module host/*.cjs cũ,
// thay Electron IPC + store.cjs bằng API của IDE (workspaceState, SecretStorage). Chỉ các hàm khai báo
// trong HANDLERS được trả lời; root luôn phải là thư mục đang mở, như projects.resolve() của app cũ.

const vscode = require('vscode');
const crypto = require('node:crypto');
const { startTurn } = require('../runtime');
const { binary, workspaceRoot } = require('../cli');
const { scanProjectTokens } = require('../host/design-tokens.cjs');
const { buildCanvasPrompt, parseCanvasProposal, validateCanvasDocument } = require('../host/canvas-ai.cjs');
const { sandboxDir } = require('./canvas-ai');
const models = require('./models');
const settingsBridge = require('./studio-settings-bridge');
const governanceBridge = require('./studio-governance-bridge');

const DESIGNS_KEY = 'yana.studio.designs.v1';
const MAX_RESPONSE = 200000; // như app cũ: cắt phần trả lời của model ở 200k ký tự
const CANVAS_SYSTEM = 'Return only the requested structured Canvas JSON. Never call tools, access files, run commands, or use the network except for the selected model provider.';

function requireRoot(root) {
	const current = workspaceRoot();
	if (!current || root !== current) throw new Error('This project is not the folder open in the IDE');
	return root;
}

async function activeProfile() {
	const cfg = vscode.workspace.getConfiguration('yana');
	const provider = cfg.get('provider', 'ollama');
	const model = cfg.get('model', '');
	if (!models.info(provider)) throw new Error(`Provider "${provider}" is not in the yana-rt catalog`);
	const key = await models.keyFor(provider);
	if (models.needsKey(provider) && !key) throw new Error(`No API key for ${provider}. Add one in Models & Runtime.`);
	return { provider, model, key, baseUrl: cfg.get('baseUrl', '') };
}

// Giống designCanvasSuggest của host/main.cjs: chạy yana-rt trong thư mục rỗng, lấy JSON đề xuất.
async function designCanvasSuggest(context, root, document, instruction, selection) {
	requireRoot(root);
	validateCanvasDocument(document);
	const bin = binary();
	if (!bin) throw new Error('Configure the Yana runtime before using Canvas AI');
	const profile = await activeProfile();
	const payload = { task: buildCanvasPrompt(document, instruction, selection), session_id: `canvas-ai-${crypto.randomUUID()}`, system: CANVAS_SYSTEM, history: [] };
	if (profile.key) payload.api_key = profile.key;
	if (profile.provider === 'custom') Object.assign(payload, { base_url: profile.baseUrl, custom_keyless: !profile.key });
	return new Promise((resolve, reject) => {
		let response = '';
		let completed = false;
		let runtimeError = '';
		const run = startTurn(
			{ binary: bin, cwd: sandboxDir(context.globalStorageUri.fsPath), provider: profile.provider, model: profile.model, resume: false, payload },
			event => {
				if (event.type === 'text_delta') response = (response + (event.text || '')).slice(0, MAX_RESPONSE);
				if (event.type === 'completed') { response = (event.message || response).slice(0, MAX_RESPONSE); completed = true; }
				if (event.type === 'error') runtimeError = event.message;
				if (event.type === 'authority_denied') runtimeError = `${event.authority}: ${event.reason}`;
				if (event.type === 'awaiting_approval') { runtimeError = 'Canvas AI attempted to use a tool, so Yana stopped the proposal'; run.stop(); }
			},
			() => {
				if (runtimeError) return reject(new Error(runtimeError));
				if (!completed) return reject(new Error('Canvas AI stopped before returning a proposal'));
				try { resolve(parseCanvasProposal(response, document)); } catch (error) { reject(error); }
			},
		);
	});
}

function designs(context) {
	const value = context.workspaceState.get(DESIGNS_KEY, {});
	return value && typeof value === 'object' ? value : {};
}

const HANDLERS = {
	designCanvasLoad: (context, root) => designs(context)[requireRoot(root)] || null,
	designCanvasSave: async (context, root, document) => {
		requireRoot(root);
		validateCanvasDocument(document);
		await context.workspaceState.update(DESIGNS_KEY, { ...designs(context), [root]: document });
		return document;
	},
	scanDesignTokens: (_context, root) => scanProjectTokens(requireRoot(root)),
	designCanvasSuggest,
	...settingsBridge.HANDLERS,
	...governanceBridge.HANDLERS,
};

// Trả lời một lời gọi window.studio từ webview. Lỗi được gửi lại dưới dạng chuỗi, không bao giờ làm sập panel.
async function handle(context, webview, message) {
	if (message?.type !== 'studio:call' || typeof message.id !== 'number') return false;
	const handler = HANDLERS[message.method];
	try {
		if (!handler) throw new Error(`"${message.method}" is not available in the IDE yet`);
		const value = await handler(context, ...(Array.isArray(message.args) ? message.args : []));
		webview.postMessage({ type: 'studio:result', id: message.id, ok: true, value });
	} catch (error) {
		webview.postMessage({ type: 'studio:result', id: message.id, ok: false, error: error.message });
	}
	return true;
}

module.exports = { handle, methods: Object.keys(HANDLERS) };

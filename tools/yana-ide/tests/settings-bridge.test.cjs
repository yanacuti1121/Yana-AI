// Kiểm tra features/studio-settings-bridge.js với một module vscode giả (không mở app).
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ext = process.argv[2];
const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-settings-'));
fs.writeFileSync(path.join(storage, 'a.json'), '{"x":1}');
const config = { provider: 'ollama', model: '', baseUrl: '', runtimePath: '' };
const secrets = new Map([['yana.key.openai', 'sk-test']]);
const global = new Map();
const fakeVscode = {
	EventEmitter: class {
		constructor() { this.listeners = []; }
		get event() { return callback => { this.listeners.push(callback); return { dispose() {} }; }; }
		fire(value) { this.listeners.forEach(callback => callback(value)); }
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: '/tmp/project' } }],
		isTrusted: true,
		getConfiguration: () => ({ get: (k, d) => (k in config ? config[k] : d), update: async (k, v) => { config[k] = v; } }),
	},
	ConfigurationTarget: { Global: 1 },
	window: {},
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
	if (request === 'vscode') return 'vscode';
	return origResolve.call(this, request, ...rest);
};
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: fakeVscode };

const models = require(path.join(ext, 'features/models.js'));
const context = {
	secrets: { get: async k => secrets.get(k), store: async (k, v) => secrets.set(k, v), delete: async k => secrets.delete(k), onDidChange: () => ({}) },
	globalState: { get: (k, d) => (global.has(k) ? global.get(k) : d), update: async (k, v) => global.set(k, v) },
	globalStorageUri: { fsPath: storage },
	extension: { packageJSON: { version: '0.1.0' } },
	subscriptions: [],
};
// models.js giữ context nội bộ qua activate; chỉ cần phần secrets cho keyFor.
try { models.activate(context); } catch { /* activate đăng ký view thật, không có trong vscode giả */ }
const { HANDLERS } = require(path.join(ext, 'features/studio-settings-bridge.js'));

let pass = 0;
let fail = 0;
const check = (name, ok) => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name); };
const rejects = async (name, work, pattern) => {
	try { await work(); check(name, false); } catch (error) { check(name, pattern.test(error.message)); }
};

(async () => {
	const state = await HANDLERS.bootstrap(context);
	check('bootstrap profile from yana.* config', state.profile.provider === 'ollama');
	check('bootstrap lists keyed providers only by id', state.configuredProviders.includes('openai') && !JSON.stringify(state).includes('sk-test'));
	check('bootstrap catalog present', state.providerCatalog.length >= 19);
	check('bootstrap preferences en/dark', state.preferences.locale === 'en' && state.preferences.theme === 'dark');
	check('bootstrap MoA default', Array.isArray(state.mixtureOfAgents.presets));
	await rejects('saveProfile rejects auto', () => HANDLERS.saveProfile(context, { provider: 'auto', model: '', baseUrl: '' }, ''), /cannot drive the IDE chat/);
	await rejects('saveProfile rejects unknown provider', () => HANDLERS.saveProfile(context, { provider: 'nope', model: 'x', baseUrl: '' }, ''), /./);
	await rejects('saveProfile rejects oversized key', () => HANDLERS.saveProfile(context, { provider: 'ollama', model: 'm', baseUrl: '' }, 'k'.repeat(16001)), /Invalid API key/);
	await rejects('saveProfile rejects newline model', () => HANDLERS.saveProfile(context, { provider: 'ollama', model: 'a\nb', baseUrl: '' }, ''), /Invalid model/);
	const saved = await HANDLERS.saveProfile(context, { provider: 'ollama', model: 'qwen2.5-coder:7b', baseUrl: '' }, '');
	check('saveProfile local writes yana.model', config.model === 'qwen2.5-coder:7b' && saved.profile.model === 'qwen2.5-coder:7b');
	await rejects('saveMixtureOfAgents rejects junk', () => HANDLERS.saveMixtureOfAgents(context, { presets: 'x' }), /Invalid Mixture/);
	await rejects('saveTitleModel rejects junk', () => HANDLERS.saveTitleModel(context, {}), /Invalid title model/);
	const title = await HANDLERS.saveTitleModel(context, { enabled: false, useMainModel: true, provider: '', model: '' });
	check('saveTitleModel persists', title.titleModel.enabled === false);
	await rejects('MoA run rejects empty prompt', () => HANDLERS.runMixtureOfAgentsPreset(context, 'x', '   ', ''), /test prompt/);
	await rejects('MoA run rejects 8001 chars', () => HANDLERS.runMixtureOfAgentsPreset(context, 'x', 'a'.repeat(8001), ''), /test prompt/);
	await rejects('MoA run rejects missing preset', () => HANDLERS.runMixtureOfAgentsPreset(context, 'x', 'hi', ''), /Preset not found/);
	await rejects('tokenUsage rejects foreign root', () => HANDLERS.tokenUsage(context, '/etc'), /not the folder open/);
	await rejects('tokenUsage rejects traversal root', () => HANDLERS.tokenUsage(context, '/tmp/project/../..'), /not the folder open/);
	const usageAll = await HANDLERS.tokenUsage(context, '');
	check('tokenUsage empty summary', usageAll.all.total === 0);
	const data = HANDLERS.dataOverview(context);
	check('dataOverview measures globalStorage', data.workspace.files === 1 && data.total_bytes === 7);
	await rejects('savePreferences not in IDE', () => HANDLERS.savePreferences(context, {}), /not available in Yana Studio IDE/);
	await rejects('backup export not in IDE', () => HANDLERS.exportPortableData(context), /not available/);
	await HANDLERS.clearProviderKey(context, 'openai');
	check('clearProviderKey removes secret', !secrets.has('yana.key.openai'));
	await rejects('clearProviderKey rejects unknown', () => HANDLERS.clearProviderKey(context, '../x'), /./);
	console.log(`${pass} passed, ${fail} failed`);
	fs.rmSync(storage, { recursive: true, force: true });
	process.exit(fail ? 1 : 0);
})();

'use strict';
// Cầu nối window.studio cho màn Settings của app Yana Studio cũ (renderer/Settings.tsx và các màn con:
// ModelManager, ModelOrchestration, TokenUsage, SystemSurfaces, PrivacyData). Mỗi hàm làm đúng việc của
// handler cùng tên trong tools/yana-studio/host/main.cjs, nhưng lưu vào chỗ của IDE:
//   - provider/model/baseUrl/runtime → cấu hình yana.* (cùng nguồn với khung chat)
//   - API key → SecretStorage (Keychain), không bao giờ trả về webview
//   - Mixture of Agents, title model → globalState
// Account, giao diện, Connections (OAuth) và sao lưu chưa có trong IDE: màn được mở với các mục đó ẩn đi,
// và nếu vẫn bị gọi thì trả lỗi rõ ràng thay vì giả vờ thành công.

const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { publicCatalog, providerById } = require('../host/model-catalog.cjs');
const { inspectLocalModels } = require('../host/local-models.cjs');
const { profileInput, discover } = require('../host/studio-runtime.cjs');
const { runPreset } = require('../host/mixture-of-agents.cjs');
const { DEFAULT_LIQUID_GLASS } = require('../host/store.cjs');
const { systemOverview } = require('../host/system-surfaces.cjs');
const { measure } = require('../host/data-overview.cjs');
const {
	AUXILIARY_FLOWS, defaultMixtureOfAgents, defaultTitleModel, isValidMoAConfig, isValidTitleModelConfig, resolveAutoProfile,
} = require('../host/model-orchestration.cjs');
const { binary, workspaceRoot } = require('../cli');
const models = require('./models');
const usage = require('./usage');

const STATE_KEY = 'yana.studio.settings.v1';
const MAX_API_KEY = 16000; // như saveProfile của app cũ
const MAX_PROMPT = 8000; // như runMixtureOfAgentsPreset của app cũ
const MAX_SCANNED_FILES = 2000;
const PREFERENCES = { locale: 'en', theme: 'dark', glassOpacity: 0, glassBlur: 18, liquidGlass: DEFAULT_LIQUID_GLASS };
const NOT_IN_IDE = name => () => { throw new Error(`${name} is not available in Yana Studio IDE yet`); };

function stored(context) {
	const value = context.globalState.get(STATE_KEY, {});
	return value && typeof value === 'object' ? value : {};
}

async function store(context, patch) {
	await context.globalState.update(STATE_KEY, { ...stored(context), ...patch });
}

function profile() {
	const cfg = vscode.workspace.getConfiguration('yana');
	return { provider: cfg.get('provider', 'ollama'), model: cfg.get('model', ''), baseUrl: cfg.get('baseUrl', '') };
}

function optionalRoot(root) {
	if (!root) return '';
	if (root !== workspaceRoot()) throw new Error('This project is not the folder open in the IDE');
	return root;
}

// Dạng State mà các màn cũ đọc (renderer/types.ts). Không có chats/projects: IDE tự quản lý chúng.
async function bootstrap(context) {
	const configuredProviders = await models.configuredKeys();
	const saved = stored(context);
	const current = profile();
	return {
		projects: [],
		chats: [],
		profile: current,
		layout: { sidebar: 250, inspector: 330, dock: 280 },
		preferences: PREFERENCES,
		runtime: binary() || '',
		hasKey: configuredProviders.includes(current.provider),
		configuredProviders,
		providerCatalog: publicCatalog(),
		auxiliaryFlows: AUXILIARY_FLOWS,
		mixtureOfAgents: isValidMoAConfig(saved.mixtureOfAgents) ? saved.mixtureOfAgents : defaultMixtureOfAgents(),
		titleModel: isValidTitleModelConfig(saved.titleModel) ? saved.titleModel : defaultTitleModel(),
		credentialStorage: 'OS keychain (SecretStorage)',
		warning: '',
		version: String(context.extension?.packageJSON?.version || ''),
		platform: `${os.platform()} · ${os.arch()}`,
		onboardingCompleted: true,
		account: { configured: false, locked: false, mode: 'none', email: '', displayName: '' },
	};
}

// Như saveProfile của app cũ: model cloud phải có trong danh sách provider trả về với key này.
async function saveProfile(context, value, apiKey) {
	const next = profileInput(value);
	if (typeof apiKey !== 'string' || apiKey.length > MAX_API_KEY) throw new Error('Invalid API key');
	if (next.provider === 'auto' || next.provider === 'mixture-of-agents') {
		throw new Error('Auto and Mixture of Agents cannot drive the IDE chat yet. Pick a provider and model.');
	}
	const provider = providerById(next.provider);
	const credential = apiKey.trim() || await models.keyFor(next.provider);
	if (provider.kind === 'cloud') {
		const available = await discover(next, credential);
		if (!available.includes(next.model)) {
			throw new Error(`Model '${next.model}' is not available for this key. Sync models and choose an available model.`);
		}
	}
	if (apiKey.trim()) await context.secrets.store(models.secretName(next.provider), apiKey.trim());
	const cfg = vscode.workspace.getConfiguration('yana');
	await cfg.update('provider', next.provider, vscode.ConfigurationTarget.Global);
	await cfg.update('model', next.model, vscode.ConfigurationTarget.Global);
	await cfg.update('baseUrl', next.baseUrl, vscode.ConfigurationTarget.Global);
	return bootstrap(context);
}

async function clearProviderKey(context, id) {
	providerById(id);
	await context.secrets.delete(models.secretName(id));
	return bootstrap(context);
}

async function discoverModels(_context, value, apiKey) {
	const parsed = profileInput(value);
	const key = typeof apiKey === 'string' && apiKey ? apiKey : await models.keyFor(parsed.provider);
	return discover(parsed, key);
}

async function keyMap() {
	const ids = await models.configuredKeys();
	return Object.fromEntries(await Promise.all(ids.map(async id => [id, await models.keyFor(id)])));
}

async function localModels() {
	const keys = await keyMap();
	return inspectLocalModels(fetch, id => keys[id] || '');
}

async function saveMixtureOfAgents(context, value) {
	if (!isValidMoAConfig(value)) throw new Error('Invalid Mixture of Agents configuration');
	await store(context, { mixtureOfAgents: value });
	return bootstrap(context);
}

async function saveTitleModel(context, value) {
	if (!isValidTitleModelConfig(value)) throw new Error('Invalid title model configuration');
	await store(context, { titleModel: value });
	return bootstrap(context);
}

// Như runMixtureOfAgentsPreset của app cũ: chạy thử một preset bằng chính yana-rt, trả nhật ký từng bước.
async function runMixtureOfAgentsPreset(context, presetId, promptText, projectRoot) {
	if (typeof promptText !== 'string' || !promptText.trim() || promptText.length > MAX_PROMPT) {
		throw new Error(`Enter a test prompt (up to ${MAX_PROMPT} characters)`);
	}
	const config = (await bootstrap(context)).mixtureOfAgents;
	const preset = config.presets.find(entry => entry.id === presetId);
	if (!preset) throw new Error('Preset not found');
	const bin = binary();
	if (!bin) throw new Error('Choose the yana-rt binary in Models & Runtime first');
	const root = optionalRoot(projectRoot) || workspaceRoot() || os.homedir();
	const keys = await keyMap();
	return runPreset(preset, { binary: bin, root, promptText: promptText.trim(), credentialFor: id => keys[id] || '' });
}

// Như chooseRuntime của app cũ: chỉ nhận binary thật, không nhận script bọc.
async function chooseRuntime() {
	const picked = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Use this yana-rt', title: 'Choose the native yana-rt binary (not a shell wrapper)' });
	if (!picked?.[0]) return null;
	const file = fs.realpathSync(picked[0].fsPath);
	if (!fs.statSync(file).isFile() || /\.(js|sh|cmd|bat)$/i.test(file)) throw new Error('Choose a native runtime binary');
	fs.accessSync(file, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
	await vscode.workspace.getConfiguration('yana').update('runtimePath', file, vscode.ConfigurationTarget.Global);
	return file;
}

function filesUnder(directory) {
	const found = [];
	const walk = dir => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (found.length >= MAX_SCANNED_FILES) return;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory() && !entry.isSymbolicLink()) walk(full);
			else if (entry.isFile()) found.push(full);
		}
	};
	if (fs.existsSync(directory)) walk(directory);
	return found;
}

// Dạng DataOverview của app cũ. Key nằm trong Keychain chứ không phải file, nên phần credentials là 0 file.
function dataOverview(context) {
	const workspace = measure(filesUnder(context.globalStorageUri.fsPath));
	return {
		total_bytes: workspace.bytes,
		workspace,
		credentials: { files: 0, bytes: 0 },
		memory: { status: 'not_created', files: 0, bytes: 0 },
		cache: { status: 'not_configured', files: 0, bytes: 0 },
	};
}

const HANDLERS = {
	bootstrap,
	saveProfile,
	clearProviderKey,
	discoverModels,
	inspectLocalModels: () => localModels(),
	// Chỉ xem trước: Auto sẽ chọn provider/model nào với các key đang có (cùng hàm app cũ dùng). Chưa dùng cho chat IDE.
	previewAutoProfile: async () => resolveAutoProfile(await models.configuredKeys()),
	saveMixtureOfAgents,
	saveTitleModel,
	runMixtureOfAgentsPreset,
	chooseRuntime: () => chooseRuntime(),
	tokenUsage: (context, projectRoot = '') => usage.summary(context, optionalRoot(projectRoot)),
	systemOverview: (_context, projectRoot = '') => {
		const root = optionalRoot(projectRoot) || workspaceRoot();
		return systemOverview({ runtime: binary(), projectRoot: root, resourcesPath: root });
	},
	dataOverview,
	savePreferences: NOT_IN_IDE('Interface preferences (use the IDE theme picker)'),
	integrationList: NOT_IN_IDE('Connections'),
	exportPortableData: NOT_IN_IDE('Backup export'),
	choosePortableData: NOT_IN_IDE('Backup restore'),
	importPortableData: NOT_IN_IDE('Backup restore'),
};

module.exports = { HANDLERS };

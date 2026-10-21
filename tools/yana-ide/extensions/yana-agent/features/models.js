const vscode = require('vscode');
const changes = require('./changes');
const { publicCatalog, providerById } = require('../host/model-catalog.cjs');
const { endpoint } = require('../host/local-models.cjs');
const { discoverModels } = require('../host/model-discovery.cjs');

const CUSTOM = 'custom';
const CONFIG_SECTION = 'yana';
const SECRET_PREFIX = 'yana.key.';
const CACHE_KEY_PREFIX = 'yana.cachedModels.';

function catalog() {
	return publicCatalog();
}

function info(id) {
	try {
		providerById(id); // throws for unknown ids
		return catalog().find(provider => provider.id === id);
	} catch {
		return undefined;
	}
}

let context;
let onDidChangeModelEmitter;

function activate(extensionContext) {
	context = extensionContext;
	onDidChangeModelEmitter = new vscode.EventEmitter();
	registerCommands();
}

function config() {
	const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const provider = cfg.get('provider', 'ollama');
	const model = cfg.get('model', '');
	const baseUrl = cfg.get('baseUrl', '');
	return { cfg, provider, model, baseUrl };
}

function secretName(providerId) {
	return `${SECRET_PREFIX}${providerId}`;
}

async function keyFor(providerId) {
	return (await context.secrets.get(secretName(providerId))) || '';
}

function needsKey(providerId) {
	const provider = info(providerId);
	return Boolean(provider?.requiresKey || provider?.id === CUSTOM);
}

async function select(provider, model) {
	const { cfg } = config();
	await cfg.update('provider', provider, vscode.ConfigurationTarget.Global);
	await cfg.update('model', model, vscode.ConfigurationTarget.Global);
	onDidChangeModelEmitter.fire({ provider, model });
}

// Lấy danh sách live model đã cache hoặc fetch mới
function getCachedModels(providerId) {
	return context.globalState.get(`${CACHE_KEY_PREFIX}${providerId}`) || [];
}

async function setCachedModels(providerId, list) {
	await context.globalState.update(`${CACHE_KEY_PREFIX}${providerId}`, list);
}

// Đồng bộ danh sách model thật từ provider qua API
async function syncedModels(provider) {
	const { baseUrl } = config();
	const key = await keyFor(provider.id);
	const list = await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: `Fetching ${provider.label} models…` },
		async () => discoverModels(provider.id, provider.id === CUSTOM ? baseUrl : '', key)
	);
	if (Array.isArray(list) && list.length > 0) {
		await setCachedModels(provider.id, list);
	}
	return list;
}

// Choose model for a provider: priority to live models from account if key is present
async function chooseModel(providerId) {
	const provider = info(providerId);
	if (!provider) return;
	if (provider.id === CUSTOM && !(await setCustomEndpoint())) return;

	let key = await keyFor(provider.id);
	if (provider.requiresKey && !key) {
		vscode.window.showInformationMessage(`${provider.label} needs an API key before you can use it.`);
		await setApiKey(provider.id);
		if (config().provider === provider.id) return; // key flow already activated a model
		key = await keyFor(provider.id);
		if (!key) return;
	}
	let liveList = getCachedModels(provider.id);

	if ((key || !provider.requiresKey) && (!liveList || liveList.length === 0)) {
		try {
			liveList = await syncedModels(provider);
		} catch (e) {
			// fallback to suggested catalog if live fetch fails
		}
	}

	const items = [
		{ label: '$(sync) Fetch the live list from the provider', action: 'sync' },
		{ label: '$(edit) Enter a model ID…', action: 'manual' },
		{ label: '$(circle-outline) Provider default', action: 'default', description: provider.defaultModel || '' },
	];

	if (liveList && liveList.length > 0) {
		items.push({ label: `Live models from your account (${liveList.length} models)`, kind: vscode.QuickPickItemKind.Separator });
		for (const mId of liveList) {
			items.push({ label: mId, model: mId, detail: 'Available with your account' });
		}
	}

	items.push({ label: 'Suggested', kind: vscode.QuickPickItemKind.Separator });
	for (const m of provider.modelCatalog) {
		items.push({ label: m.id, description: `${m.label} · ${m.context}`, detail: (m.tags || []).join(', '), model: m.id });
	}

	const picked = await vscode.window.showQuickPick(items, {
		placeHolder: `Model for ${provider.label}`,
		matchOnDescription: true,
		matchOnDetail: true,
	});

	if (!picked) return;
	if (picked.model) return select(provider.id, picked.model);
	if (picked.action === 'default') return select(provider.id, '');
	if (picked.action === 'manual') {
		const model = await vscode.window.showInputBox({
			prompt: `Model ID for ${provider.label}`,
			value: config().provider === provider.id ? config().model : '',
		});
		return model === undefined ? undefined : select(provider.id, model.trim());
	}
	if (picked.action === 'sync') {
		if (needsKey(provider.id) && !(await keyFor(provider.id))) {
			vscode.window.showWarningMessage(`Add an API key for ${provider.label} before fetching its models.`);
			return setApiKey(provider.id);
		}
		try {
			const models = await syncedModels(provider);
			const chosen = await vscode.window.showQuickPick(models, {
				placeHolder: `${models.length} models served by ${provider.label}`,
			});
			if (chosen) await select(provider.id, chosen);
		} catch (error) {
			vscode.window.showErrorMessage(`Yana: ${error.message}`);
		}
	}
}

async function setCustomEndpoint() {
	const value = await vscode.window.showInputBox({
		prompt: 'Base URL of the OpenAI-compatible endpoint (HTTPS, or HTTP on 127.0.0.1/localhost)',
		value: config().baseUrl,
		validateInput: text => {
			try {
				endpoint(text);
				return undefined;
			} catch (error) {
				return error.message;
			}
		},
	});
	if (value === undefined) return false;
	await config().cfg.update('baseUrl', endpoint(value), vscode.ConfigurationTarget.Global);
	return true;
}

// Provider picker (Cloud vs Local AI)
async function pickModel() {
	const keyed = new Set(await configuredKeys());
	const items = catalog().map(provider => {
		const isLocal = provider.kind === 'local' || provider.category === 'local';
		let detailText = '';
		if (isLocal) {
			detailText = '$(server) On-device (Local Loopback)';
		} else if (provider.requiresKey) {
			detailText = keyed.has(provider.id) ? '$(key) Key saved' : '$(circle-slash) No key';
		} else {
			detailText = '$(home) No key needed';
		}
		const isCurrent = provider.id === config().provider;
		return {
			label: isCurrent ? `$(check) ${provider.label}` : provider.label,
			description: `${provider.id} · ${provider.company || provider.kind}${isCurrent ? ' · in use' : ''}`,
			detail: detailText,
			id: provider.id,
		};
	});
	const qp = vscode.window.createQuickPick();
	qp.items = items;
	qp.placeholder = `Select Provider (41 available · current: ${config().provider})`;
	qp.matchOnDescription = true;
	qp.matchOnDetail = true;
	const current = items.find(item => item.id === config().provider);
	if (current) qp.activeItems = [current];
	const picked = await new Promise(resolve => {
		qp.onDidAccept(() => { resolve(qp.selectedItems[0]); qp.hide(); });
		qp.onDidHide(() => { resolve(undefined); qp.dispose(); });
		qp.show();
	});
	if (picked) await chooseModel(picked.id);
}

async function configuredKeys() {
	const ids = catalog().filter(provider => provider.requiresKey || provider.id === CUSTOM).map(provider => provider.id);
	const present = await Promise.all(ids.map(async id => ((await keyFor(id)) ? id : '')));
	return present.filter(Boolean);
}

// When user saves API key -> auto fetch live models
async function setApiKey(providerId) {
	let id = typeof providerId === 'string' ? providerId : providerId?.providerId;
	if (!id) {
		const picked = await vscode.window.showQuickPick(
			catalog().filter(provider => provider.requiresKey || provider.id === CUSTOM).map(provider => ({
				label: provider.label,
				description: provider.envVar || provider.id,
				id: provider.id,
			})),
			{ placeHolder: 'Provider that needs an API key' }
		);
		id = picked?.id;
	}
	if (!id) return;
	const provider = info(id);
	const key = await vscode.window.showInputBox({
		prompt: `API key for ${provider?.label || id} (stored in Keychain via SecretStorage)`,
		password: true,
		ignoreFocusOut: true,
	});
	if (!key) return;
	await context.secrets.store(secretName(id), key.trim());
	vscode.window.showInformationMessage(`Saved the API key for ${provider?.label || id}. Checking models…`);

	try {
		const models = await syncedModels(provider);
		if (models && models.length > 0) {
			const pickNow = await vscode.window.showInformationMessage(
				`Found ${models.length} live models for ${provider.label}. Choose one now?`,
				'Choose model', 'Later'
			);
			if (pickNow === 'Choose model') {
				const chosen = await vscode.window.showQuickPick(models, {
					placeHolder: `Select a model to activate for ${provider.label}`,
				});
				if (chosen) await select(provider.id, chosen);
			}
		}
	} catch (err) {
		vscode.window.showWarningMessage(`Saved key, but could not load models: ${err.message}`);
	}
}

async function removeKey(item) {
	const id = item?.providerId || item;
	if (!id) return;
	const answer = await vscode.window.showWarningMessage(
		`Remove the ${info(id)?.label || id} API key from Keychain?`,
		{ modal: true },
		'Remove'
	);
	if (answer === 'Remove') {
		await context.secrets.delete(secretName(id));
		await context.globalState.update(`${CACHE_KEY_PREFIX}${id}`, undefined);
		vscode.window.showInformationMessage(`Removed the API key for ${info(id)?.label || id}.`);
	}
}

function providerItem(provider, keyed, active) {
	const item = infoItem(provider.label, active.provider === provider.id ? 'pass-filled' : provider.kind === 'cloud' ? 'cloud' : 'server', provider.company);
	const keyText = provider.requiresKey ? (keyed.has(provider.id) ? 'key ✓' : 'no key') : '';
	item.description = [active.provider === provider.id ? active.model || 'default' : '', keyText].filter(Boolean).join(' · ');
	item.providerId = provider.id;
	// Giá trị này phải khớp điều kiện `viewItem` trong package.json (nút Key và nút xoá key); tests/manifest.test.cjs kiểm tra.
	item.contextValue = provider.requiresKey ? (keyed.has(provider.id) ? 'yana.provider.keyed' : 'yana.provider.nokeyed') : 'yana.provider.nokey';
	item.command = { command: 'yana.models.choose', title: 'Choose model', arguments: [provider.id] };
	return item;
}

function infoItem(label, icon, description) {
	const item = new vscode.TreeItem(label);
	item.iconPath = new vscode.ThemeIcon(icon);
	item.description = description;
	return item;
}

class ModelsTreeProvider {
	constructor() {
		this._onDidChange = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChange.event;
		// Đổi model/provider hoặc lưu/xoá API key đều làm mới cây (trước đây chỉ nghe cấu hình nên nhãn "no key" bị cũ).
		changes.listen(['config', 'secrets'], () => this._onDidChange.fire());
	}

	async getChildren(element) {
		if (element) return [];
		const keyed = new Set(await configuredKeys());
		const active = config();
		return catalog().map(provider => providerItem(provider, keyed, active));
	}

	getTreeItem(element) {
		return element;
	}
}

function registerCommands() {
	const tree = new ModelsTreeProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('yana.models', tree),
		vscode.commands.registerCommand('yana.pickModel', pickModel),
		vscode.commands.registerCommand('yana.setApiKey', setApiKey),
		vscode.commands.registerCommand('yana.models.choose', id => chooseModel(id?.providerId || id)),
		vscode.commands.registerCommand('yana.models.select', (provider, model) => select(String(provider || ''), String(model || ''))),
		vscode.commands.registerCommand('yana.modelsRuntime.open', () => vscode.commands.executeCommand('yana.settings.open')),
		vscode.commands.registerCommand('yana.models.setKey', id => setApiKey(id?.providerId || id)),
		vscode.commands.registerCommand('yana.models.removeKey', removeKey),
		vscode.commands.registerCommand('yana.models.refresh', () => tree._onDidChange.fire()),
	);
}

module.exports = {
	id: 'models',
	activate,
	config,
	info,
	keyFor,
	needsKey,
	select,
	syncedModels,
	chooseModel,
	setApiKey,
	removeKey,
	configuredKeys,
	secretName,
	onDidChangeModel: listener => onDidChangeModelEmitter.event(listener),
};

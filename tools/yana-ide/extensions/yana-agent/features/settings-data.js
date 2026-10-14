'use strict';
// Dữ liệu thật cho từng tab của trang Yana Settings. Không có số mẫu: thiếu dữ liệu thì trả trạng thái trống.

const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const { publicCatalog } = require('../host/model-catalog.cjs');
const { inspectLocalModels } = require('../host/local-models.cjs');
const { systemOverview, commandReference } = require('../host/system-surfaces.cjs');
const { measure } = require('../host/data-overview.cjs');
const { runJson, binary, workspaceRoot } = require('../cli');
const { runtimeVersion } = require('../runtime');
const models = require('./models');
const usage = require('./usage');
const { memorySystem } = require('./project');

// Các luồng phụ trợ của app cũ chưa có nơi nào gọi tới (host/model-orchestration.cjs AUXILIARY_FLOWS).
const AUXILIARY_FLOWS = [
	['Image analysis', 'there is no dedicated image analysis flow.'],
	['Context compression', 'yana-rt has no context compression step the IDE can call.'],
	['Skill search', 'there is no model-driven skill search.'],
	['Smart approval', 'approvals are decided by a human, not by a model.'],
	['MCP routing', 'there is no per-model MCP routing.'],
	['Code review', 'there is no automatic review flow.'],
	['Triage/specification', 'there is no automatic triage or spec flow.'],
	['Kanban split', 'Tasks has no model-driven task splitting.'],
	['Profile description', 'there is no automatic profile description.'],
	['Curator / skill usage review', 'there is no curator tracking skill usage.'],
];

function config() {
	const cfg = vscode.workspace.getConfiguration('yana');
	return { provider: cfg.get('provider', 'ollama'), model: cfg.get('model', ''), baseUrl: cfg.get('baseUrl', ''), runtimePath: cfg.get('runtimePath', '') };
}

async function safe(load, fallback) {
	try {
		return await load();
	} catch (error) {
		return { ...fallback, error: error.message };
	}
}

async function keyedProviders() {
	const ids = publicCatalog().filter(p => p.requiresKey || p.id === 'custom').map(p => p.id);
	const present = await Promise.all(ids.map(async id => ((await models.keyFor(id)) ? id : '')));
	return present.filter(Boolean);
}

async function modelsTab() {
	const keyed = new Set(await keyedProviders());
	const bin = binary();
	const providers = publicCatalog().map(p => ({
		id: p.id, label: p.label, company: p.company, kind: p.kind, category: p.category || (p.kind === 'local' ? 'local' : p.kind === 'cloud' ? 'cloud' : 'enterprise'),
		badge: p.badge || '', modelsSummary: p.modelsSummary || `${p.modelCatalog.length} models`,
		requiresKey: p.requiresKey, keyed: keyed.has(p.id), defaultModel: p.defaultModel, baseUrl: p.baseUrl || '',
		models: p.modelCatalog.map(m => ({ id: m.id, label: m.label, context: m.context, tags: m.tags || [] })),
	}));
	return {
		active: config(),
		providers,
		runtime: { path: bin, version: bin ? await runtimeVersion(bin) : '' },
		auxiliary: AUXILIARY_FLOWS.map(([name, reason]) => ({ name, reason })),
	};
}

async function localTab() {
	const keyed = await keyedProviders();
	const keys = Object.fromEntries(await Promise.all(keyed.map(async id => [id, await models.keyFor(id)])));
	return { local: await inspectLocalModels(fetch, id => keys[id] || '') };
}

async function permissionsTab() {
	const leases = await safe(async () => ({ list: await runJson(['lease', 'list', '--json']) }), { list: [] });
	const approvals = await safe(async () => ({ list: await runJson(['authority', 'pending-approvals', '--json']) }), { list: [] });
	return { leases: leases.list || [], leasesError: leases.error || '', approvals: approvals.list || [], approvalsError: approvals.error || '' };
}

async function toolsTab() {
	const root = workspaceRoot();
	const overview = await systemOverview({ runtime: binary(), projectRoot: root, resourcesPath: root });
	return { runtime: overview.runtime, discord: overview.discord, externalTools: overview.externalTools, capabilities: overview.capabilities };
}

function filesUnder(directory, limit = 2000) {
	const found = [];
	const walk = dir => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (found.length >= limit) return;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory() && !entry.isSymbolicLink()) walk(full);
			else if (entry.isFile()) found.push(full);
		}
	};
	if (fs.existsSync(directory)) walk(directory);
	return found;
}

function dataTab(context) {
	const root = workspaceRoot();
	const project = root ? measure(filesUnder(path.join(root, '.yana-ai'))) : { files: 0, bytes: 0 };
	const extension = measure(filesUnder(context.globalStorageUri.fsPath));
	return {
		root,
		project,
		extension,
		memoryBytes: Buffer.byteLength(memorySystem(root)),
		usageRecords: usage.count(context),
	};
}

async function themeTab() {
	const cfg = vscode.workspace.getConfiguration('workbench');
	return { colorTheme: cfg.get('colorTheme', ''), language: vscode.env.language };
}

async function load(tab, context) {
	switch (tab) {
		case 'account': return { language: vscode.env.language, machine: vscode.env.appName };
		case 'appearance': return themeTab();
		case 'models': return modelsTab();
		case 'local': return localTab();
		case 'usage': return usage.summary(context, workspaceRoot());
		case 'connections': return {};
		case 'permissions': return permissionsTab();
		case 'tools': return toolsTab();
		case 'commands': return commandReference(workspaceRoot());
		case 'data': return dataTab(context);
		default: return {};
	}
}

module.exports = { load };

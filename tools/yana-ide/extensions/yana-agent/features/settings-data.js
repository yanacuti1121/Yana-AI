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
const { getActiveLanguage } = require('./language');

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

function getWorkspaces() {
	return (vscode.workspace.workspaceFolders || []).map(f => ({
		name: f.name,
		path: f.uri.fsPath,
		isTrusted: vscode.workspace.isTrusted,
	}));
}

async function modelsTab(context) {
	const keyed = new Set(await keyedProviders());
	const bin = binary();
	const root = workspaceRoot();
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
		tokenUsage: context ? usage.summary(context, root) : { all: { input: 0, output: 0, total: 0, rounds: 0 } },
		workspaces: getWorkspaces(),
	};
}

async function editorTab() {
	const cfgEditor = vscode.workspace.getConfiguration('editor');
	const cfgDiff = vscode.workspace.getConfiguration('diffEditor');
	const cfgYana = vscode.workspace.getConfiguration('yana');
	return {
		formatOnSave: cfgEditor.get('formatOnSave', false),
		formatOnSaveMode: cfgEditor.get('formatOnSaveMode', 'file'),
		formatOnType: cfgEditor.get('formatOnType', false),
		codeLens: cfgEditor.get('codeLens', true),
		diffAlgorithm: cfgDiff.get('algorithm', 'advanced'),
		showEmptyDecorations: cfgDiff.get('experimental.showEmptyDecorations', true),
		showMoves: cfgDiff.get('experimental.showMoves', false),
		useInlineView: cfgDiff.get('useInlineViewWhenSpaceIsLimited', true),
		hideUnchangedContextLines: cfgDiff.get('hideUnchangedRegions.contextLineCount', 3),
		hideUnchangedEnabled: cfgDiff.get('hideUnchangedRegions.enabled', false),
		agent: {
			name: 'Yana-AI',
			disclaimer: 'AI may make mistakes. Double-check all generated code.',
			requireApprovalForWrites: cfgYana.get('guardrails.requireApprovalForWrites', true),
			blastRadiusLimit: cfgYana.get('guardrails.blastRadiusLimit', 5),
		},
	};
}

async function customizationsTab() {
	const root = workspaceRoot();
	let rulesCount = 0;
	let skillsCount = 0;
	let hasAgentsMd = false;
	if (root) {
		const agentsMd = path.join(root, 'AGENTS.md');
		hasAgentsMd = fs.existsSync(agentsMd);
		for (const candidate of ['.agents/rules', 'core/rules', 'rules']) {
			const rulesDir = path.join(root, candidate);
			if (fs.existsSync(rulesDir)) {
				try { rulesCount = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md')).length; break; } catch {}
			}
		}
		for (const candidate of ['.agents/skills', 'core/skills', 'skills']) {
			const skillsDir = path.join(root, candidate);
			if (fs.existsSync(skillsDir)) {
				try { skillsCount = fs.readdirSync(skillsDir).length; break; } catch {}
			}
		}
	}
	return {
		rulesCount,
		skillsCount,
		hasAgentsMd,
		root: root || 'No workspace opened',
		rules: [
			{ id: 'truth-gate', name: 'Truth Gate (L3)', desc: 'Evidence required before stating done, fixed, or passed' },
			{ id: 'action-gate', name: 'Action Gate (L0-L5)', desc: 'Approval required before writes, commits, or deployments' },
			{ id: 'destructive-guard', name: 'Destructive Action Guard', desc: 'Blocks rm -rf, drop table, force push' },
			{ id: 'scope-guard', name: 'Scope Boundary Guard', desc: 'Prevents unintended cross-scope modifications' },
		],
	};
}

async function generalTab() {
	const cfgFiles = vscode.workspace.getConfiguration('files');
	const cfgExplorer = vscode.workspace.getConfiguration('explorer');
	const cfgTelemetry = vscode.workspace.getConfiguration('telemetry');
	return {
		language: getActiveLanguage(),
		autoSave: cfgFiles.get('autoSave', 'off'),
		confirmDelete: cfgExplorer.get('confirmDelete', true),
		telemetryLevel: cfgTelemetry.get('telemetryLevel', 'off'),
	};
}

async function browserTab() {
	const cfg = vscode.workspace.getConfiguration('yana');
	return {
		previewMode: cfg.get('browser.previewMode', 'internal-webview'),
		debugPort: cfg.get('browser.debugPort', 9222),
	};
}

async function tabTab() {
	const cfg = vscode.workspace.getConfiguration('editor');
	return {
		inlineSuggest: cfg.get('inlineSuggest.enabled', true),
		quickSuggestions: Boolean(cfg.get('quickSuggestions', true)),
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
	return { colorTheme: cfg.get('colorTheme', ''), language: getActiveLanguage() };
}

async function load(tab, context) {
	const lang = getActiveLanguage();
	let result = {};
	switch (tab) {
		case 'account': result = { language: lang, machine: vscode.env.appName, workspaces: getWorkspaces() }; break;
		case 'general': result = await generalTab(); break;
		case 'appearance': result = await themeTab(); break;
		case 'models': result = await modelsTab(context); break;
		case 'customizations': result = await customizationsTab(); break;
		case 'browser': result = await browserTab(); break;
		case 'tab': result = await tabTab(); break;
		case 'editor': result = await editorTab(); break;
		case 'local': result = await localTab(); break;
		case 'usage': result = usage.summary(context, workspaceRoot()); break;
		case 'connections': result = { runtime: await toolsTab() }; break;
		case 'permissions': result = await permissionsTab(); break;
		case 'tools': result = await toolsTab(); break;
		case 'commands': result = commandReference(workspaceRoot()); break;
		case 'data': result = dataTab(context); break;
		default: result = {}; break;
	}
	return { ...result, currentLanguage: lang };
}

module.exports = { load };

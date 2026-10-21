'use strict';
// System: máy đang chạy Yana (yana-rt os host status), năng lực runtime mà AI được dùng, công cụ AI khác trên máy,
// allowlist Discord, và bảng lệnh COMMANDS.md. Logic lấy từ app Yana Studio cũ (host/system-surfaces, devices).

const vscode = require('vscode');
const { systemOverview, commandReference } = require('../host/system-surfaces.cjs');
const { runJson, binary, workspaceRoot } = require('../cli');
const { YanaTree, infoItem, group } = require('./tree');

const GIB = 1024 ** 3;

function leaf(label, icon, description, tooltip) {
	const item = infoItem(label, icon, tooltip);
	item.description = description;
	return item;
}

async function hostGroup() {
	try {
		const host = await runJson(['os', 'host', 'status', '--json']);
		const items = [
			leaf('Operating system', 'device-desktop', `${host.os} · ${host.arch}`),
			leaf('CPU', 'chip', `${host.cpu?.vendor ?? 'unknown'} · ${host.cpu?.logical_cores ?? '?'} cores`),
			leaf('Memory', 'database', host.memory?.total_bytes ? `${Math.round(host.memory.total_bytes / GIB)} GB · ${host.memory.model ?? ''}` : 'unknown'),
			...(host.accelerators || []).map(acc => leaf(acc.name || acc.kind, 'circuit-board', `${acc.backend ?? ''} · ${acc.memory_model ?? ''}`)),
			...Object.entries(host.capabilities || {}).map(([name, state]) => leaf(name, state === 'supported' ? 'pass' : 'circle-outline', state)),
		];
		return group('This machine', 'vm', items, `${host.os} · ${host.arch}`);
	} catch (error) {
		return group('This machine', 'vm', [leaf(error.message, 'warning', '')], 'error');
	}
}

async function loadSystem() {
	const root = workspaceRoot();
	const overview = await systemOverview({ runtime: binary(), projectRoot: root, resourcesPath: root });
	const runtime = overview.runtime;
	const capabilities = overview.capabilities.map(cap =>
		leaf(cap.name, cap.available ? 'pass' : 'circle-slash', `${cap.accessMode} · ${cap.riskTier} · approval: ${cap.approval}`, cap.description));
	const tools = overview.externalTools.map(tool =>
		leaf(tool.label, tool.available ? 'pass' : 'circle-outline', tool.available ? tool.path : 'not found on PATH'));
	const discord = overview.discord;
	const commands = infoItem('COMMANDS.md reference', 'list-unordered', overview.commands.source || overview.commands.error);
	commands.description = overview.commands.commands.length ? `${overview.commands.commands.length} commands` : overview.commands.error;
	commands.command = { command: 'yana.commandReference', title: 'Open command reference' };
	return [
		await hostGroup(),
		group('Runtime', 'pulse', [
			leaf('yana-rt', runtime.available ? 'pass' : 'error', runtime.available ? binary() : runtime.error),
			leaf('MCP server', runtime.mcp ? 'pass' : 'circle-outline', runtime.mcp ? 'available' : 'not available'),
			leaf('Remote (Discord)', runtime.discord ? 'pass' : 'circle-outline', runtime.discord ? 'available' : 'not available'),
			leaf('Discord bot token', discord.configured ? 'key' : 'circle-outline', discord.configured ? 'set (hidden)' : 'not set'),
			leaf('Discord allowlist', 'shield', `${discord.channels} channels · ${discord.users} users`, discord.warning || discord.configPath),
		], runtime.available ? 'ready' : 'not running'),
		group('AI capabilities', 'tools', capabilities, `${capabilities.length}`),
		group('Other AI tools on this machine', 'extensions', tools, `${overview.externalTools.filter(t => t.available).length}/${tools.length}`),
		commands,
	];
}

async function commandReferencePick() {
	const reference = commandReference(workspaceRoot());
	if (!reference.commands.length) {
		vscode.window.showWarningMessage(`Yana: ${reference.error}. Open the folder that contains COMMANDS.md.`);
		return;
	}
	const picked = await vscode.window.showQuickPick(
		reference.commands.map(entry => ({ label: entry.command, description: entry.category, detail: entry.description, entry })),
		{ placeHolder: 'Search Yana commands', matchOnDescription: true, matchOnDetail: true });
	if (!picked) return;
	const action = await vscode.window.showQuickPick(['Copy', 'Insert into terminal (not run)'], { placeHolder: picked.label });
	if (action === 'Copy') await vscode.env.clipboard.writeText(picked.label);
	if (action?.startsWith('Insert')) {
		const terminal = vscode.window.activeTerminal || vscode.window.createTerminal({ name: 'Yana', cwd: workspaceRoot() || undefined });
		terminal.show();
		terminal.sendText(picked.label, false);
	}
}

function activate(context) {
	const tree = new YanaTree(loadSystem, '');
	context.subscriptions.push(
		vscode.window.createTreeView('yana.system', { treeDataProvider: tree, showCollapseAll: true }),
		vscode.commands.registerCommand('yana.system.refresh', () => tree.refresh()),
		vscode.commands.registerCommand('yana.commandReference', commandReferencePick),
		vscode.workspace.onDidGrantWorkspaceTrust(() => tree.refresh()),
	);
}

module.exports = { id: 'system', activate };

'use strict';
// Project: Project Memory (.yana-ai/project-memory.md, gửi kèm mỗi lượt chat làm `system`) và lệnh ghim của dự án.
// Logic lấy từ app Yana Studio cũ (host/project-memory, host/run-commands). Memory mở bằng editor thường của IDE.

const vscode = require('vscode');
const fs = require('node:fs');
const { ProjectMemory } = require('../host/project-memory.cjs');
const { RunCommands } = require('../host/run-commands.cjs');
const { workspaceRoot } = require('../cli');
const { YanaTree, infoItem, group } = require('./tree');

const memory = new ProjectMemory();
const runCommands = new RunCommands();
const MEMORY_TEMPLATE = '# Project Memory\n\nLong-lived notes for this project. Yana sends this file with every chat turn.\n';

function requireRoot() {
	const root = workspaceRoot();
	if (!root) throw Object.assign(new Error('No folder open'), { kind: 'no-folder' });
	return root;
}

// Nội dung memory dạng `system` cho yana-rt chat. Trống thì trả '' để không gửi gì.
function memorySystem(root) {
	if (!root) return '';
	try {
		const text = memory.read(root).text.trim();
		if (!text) return '';
		return `YANA PROJECT MEMORY\nUse only when relevant. Never claim a source that is not present.\n\n${text}`.slice(0, 64 * 1024);
	} catch {
		return '';
	}
}

async function openMemory() {
	try {
		const root = requireRoot();
		if (!fs.existsSync(memory.file(root))) memory.write(root, MEMORY_TEMPLATE);
		await vscode.window.showTextDocument(vscode.Uri.file(memory.file(root)));
	} catch (error) {
		vscode.window.showErrorMessage(`Yana: ${error.message}`);
	}
}

async function addCommand(tree) {
	try {
		const root = requireRoot();
		const name = await vscode.window.showInputBox({ prompt: 'Pinned command name (for example: Test)' });
		if (!name) return;
		const command = await vscode.window.showInputBox({ prompt: `Shell command for "${name}"`, placeHolder: 'npm test' });
		if (!command) return;
		runCommands.create(root, { name, command });
		tree.refresh();
	} catch (error) {
		vscode.window.showErrorMessage(`Yana: ${error.message}`);
	}
}

function runCommand(entry) {
	if (!entry?.command) return;
	if (!vscode.workspace.isTrusted) {
		vscode.window.showWarningMessage('Trust this folder before running a pinned command.');
		return;
	}
	const terminal = vscode.window.createTerminal({ name: `Yana · ${entry.name}`, cwd: workspaceRoot() || undefined, iconPath: new vscode.ThemeIcon('pinned') });
	terminal.show();
	terminal.sendText(entry.command);
}

async function removeCommand(item, tree) {
	const entry = item?.entry;
	if (!entry) return;
	const answer = await vscode.window.showWarningMessage(`Unpin "${entry.name}"?`, { modal: true }, 'Unpin');
	if (answer !== 'Unpin') return;
	try {
		runCommands.remove(requireRoot(), entry.id);
		tree.refresh();
	} catch (error) {
		vscode.window.showErrorMessage(`Yana: ${error.message}`);
	}
}

async function loadProject() {
	const root = requireRoot();
	const saved = memory.read(root);
	const memoryItem = infoItem('Project Memory', 'book', memory.file(root));
	memoryItem.description = saved.text.trim() ? `${Buffer.byteLength(saved.text)} bytes · sent with every chat turn` : 'empty · click to write';
	memoryItem.command = { command: 'yana.memory.open', title: 'Open Project Memory' };
	const pinned = runCommands.list(root).map(entry => {
		const item = infoItem(entry.name, 'terminal', entry.command);
		item.description = entry.command;
		item.contextValue = 'yana.runCommand';
		item.entry = entry;
		item.command = { command: 'yana.runCommands.run', title: 'Run', arguments: [entry] };
		return item;
	});
	return [memoryItem, group('Pinned commands', 'pinned', pinned.length ? pinned : [infoItem('No commands yet. Click + to pin one.', 'info')], String(pinned.length))];
}

function activate(context) {
	const tree = new YanaTree(loadProject, '');
	const watcher = vscode.workspace.createFileSystemWatcher('**/.yana-ai/{project-memory.md,studio-run-commands.json}');
	context.subscriptions.push(
		vscode.window.createTreeView('yana.project', { treeDataProvider: tree }),
		watcher,
		watcher.onDidChange(() => tree.refresh()),
		watcher.onDidCreate(() => tree.refresh()),
		watcher.onDidDelete(() => tree.refresh()),
		vscode.commands.registerCommand('yana.memory.open', openMemory),
		vscode.commands.registerCommand('yana.runCommands.add', () => addCommand(tree)),
		vscode.commands.registerCommand('yana.runCommands.run', entry => runCommand(entry?.entry || entry)),
		vscode.commands.registerCommand('yana.runCommands.remove', item => removeCommand(item, tree)),
		vscode.commands.registerCommand('yana.runCommands.pick', async () => {
			const root = workspaceRoot();
			const entries = root ? runCommands.list(root) : [];
			const picked = await vscode.window.showQuickPick(entries.map(entry => ({ label: entry.name, description: entry.command, entry })), { placeHolder: entries.length ? 'Run a pinned command' : 'No pinned commands yet' });
			if (picked) runCommand(picked.entry);
		}),
	);
}

module.exports = { id: 'project', activate, memorySystem };

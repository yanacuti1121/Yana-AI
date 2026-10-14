'use strict';
// Khu "Start" ở đầu cột Yana: lối vào bấm thẳng cho mọi tính năng (chat, Design Canvas, model, Settings,
// Project Memory, công cụ), để không phải nhớ lệnh trong Command Palette. Chỉ là danh sách lối tắt tới các
// lệnh đã có; không chứa dữ liệu riêng.

const vscode = require('vscode');
const { YanaTree, infoItem, group } = require('./tree');

const SECTIONS = [
	['Chat', 'comment-discussion', [
		['Yana Home', 'home', 'yana.welcome.open', 'The start page'],
		['User guide', 'book', 'yana.guide.open', 'Step-by-step manual'],
		['Yana IDE settings', 'settings-gear', 'yana.idePreferences.open', 'Guide, approvals, assistant'],
		['Yana Control Center', 'dashboard', 'yana.controlCenter.open', 'Live status of every Yana part'],
		['Open Yana chat', 'comment-discussion', 'yana.focus', 'Right-hand panel. ⌘L'],
		['New conversation', 'add', 'yana.chat.new'],
		['Open a past conversation…', 'history', 'yana.chat.history'],
	]],
	['Design', 'paintcan', [
		['New Design Canvas', 'paintcan', 'yana.canvas.new', 'AI builds screens live; any model'],
		['Open a design canvas…', 'folder-opened', 'yana.canvas.open'],
		['Studio Canvas (component editor)', 'layout', 'yana.studio.canvas', 'From Yana Studio: 22 components, layers, AI edits'],
	]],
	['Models & settings', 'settings-gear', [
		['Choose model', 'sparkle', 'yana.pickModel'],
		['Add an API key', 'key', 'yana.setApiKey'],
		['Yana Settings', 'settings-gear', 'yana.settings.open'],
	]],
	['Project', 'book', [
		['Project Memory', 'book', 'yana.memory.open', 'Sent with every conversation'],
		['Pin a command', 'pinned', 'yana.runCommands.add'],
		['Run a pinned command…', 'play', 'yana.runCommands.pick'],
		['Tasks board', 'tasklist', 'yana.tasks.open', 'Dependencies and evidence'],
		['New task', 'tasklist', 'yana.tasks.create'],
	]],
	['Check & govern', 'shield', [
		['Doctor', 'heart', 'yana.tool.doctor', 'Environment and dependencies'],
		['Scan agent setup', 'search', 'yana.tool.scan'],
		['Permissions', 'shield', 'yana.permissions.open', 'Leases, grant, pending approvals'],
		['Hunt vulnerabilities', 'bug', 'yana.tool.hunt'],
		['Yana commands reference', 'list-unordered', 'yana.commandReference'],
	]],
];

function entry([label, icon, command, detail]) {
	const item = infoItem(label, icon, detail || label);
	if (detail) item.description = detail;
	item.command = { command, title: label };
	return item;
}

async function openCanvas() {
	const files = await vscode.workspace.findFiles('**/*.yana-canvas.json', '**/node_modules/**', 200);
	if (!files.length) {
		const answer = await vscode.window.showInformationMessage('No design canvas in this project yet.', 'New Design Canvas');
		if (answer) await vscode.commands.executeCommand('yana.canvas.new');
		return;
	}
	const picked = await vscode.window.showQuickPick(
		files.map(uri => ({ label: vscode.workspace.asRelativePath(uri), uri })),
		{ placeHolder: 'Open a design canvas' });
	if (picked) await vscode.commands.executeCommand('vscode.openWith', picked.uri, 'yana.canvas');
}

function activate(context) {
	const tree = new YanaTree(async () => SECTIONS.map(([name, icon, items]) => group(name, icon, items.map(entry), '')), '');
	context.subscriptions.push(
		vscode.window.createTreeView('yana.home', { treeDataProvider: tree }),
		vscode.commands.registerCommand('yana.canvas.open', openCanvas),
	);
}

module.exports = { id: 'home', activate };

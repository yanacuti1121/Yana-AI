'use strict';
// Công cụ Yana trong Command Palette và view Tools: chạy lệnh yana-rt trong một terminal riêng
// để anh thấy toàn bộ output. Chỉ chạy các lệnh cố định bên dưới, không ghép chuỗi người dùng nhập.

const vscode = require('vscode');
const { binary, workspaceRoot } = require('../cli');
const { YanaTree, infoItem } = require('./tree');

const TOOLS = [
	{ id: 'doctor', label: 'Doctor', icon: 'heart', args: ['doctor', 'run'], detail: 'Check the environment and dependencies' },
	{ id: 'scan', label: 'Scan', icon: 'search', args: ['scan'], detail: 'Audit agent configuration for security risks' },
	{ id: 'hunt', label: 'Hunt', icon: 'bug', args: ['hunt', 'run'], detail: 'Scan for secrets, code vulnerabilities, dependencies and supply chain' },
	{ id: 'score', label: 'Score', icon: 'graph', args: ['score', 'show'], detail: 'Audit score with deductions' },
	{ id: 'map', label: 'Blast radius map', icon: 'type-hierarchy', args: ['map', 'show'], detail: 'What the AI can reach' },
	{ id: 'ci', label: 'CI health', icon: 'github-action', args: ['ci', 'check'], detail: 'Secrets, unpinned actions and permissions in workflows' },
	{ id: 'cost', label: 'Cost', icon: 'credit-card', args: ['cost', 'show'], detail: 'Tokens and cost used' },
];

function shellQuote(value) {
	return `'${String(value).split("'").join("'\\''")}'`;
}

function runTool(tool) {
	const bin = binary();
	if (!bin) {
		vscode.window.showErrorMessage('yana-rt not found. Set yana.runtimePath in settings.');
		return;
	}
	if (!vscode.workspace.isTrusted) {
		vscode.window.showWarningMessage('Trust this folder before running a Yana tool.');
		return;
	}
	const terminal = vscode.window.createTerminal({ name: `Yana · ${tool.label}`, cwd: workspaceRoot() || undefined, iconPath: new vscode.ThemeIcon(tool.icon) });
	terminal.show();
	terminal.sendText([bin, ...tool.args].map(shellQuote).join(' '));
}

function toolItem(tool) {
	const item = infoItem(tool.label, tool.icon, tool.detail);
	item.description = `yana-rt ${tool.args.join(' ')}`;
	item.command = { command: `yana.tool.${tool.id}`, title: tool.label };
	return item;
}

function activate(context) {
	const tree = new YanaTree(async () => TOOLS.map(toolItem), '');
	context.subscriptions.push(vscode.window.createTreeView('yana.tools', { treeDataProvider: tree }));
	for (const tool of TOOLS) {
		context.subscriptions.push(vscode.commands.registerCommand(`yana.tool.${tool.id}`, () => runTool(tool)));
	}
	context.subscriptions.push(vscode.commands.registerCommand('yana.tools.pick', async () => {
		const picked = await vscode.window.showQuickPick(TOOLS.map(tool => ({ label: `$(${tool.icon}) ${tool.label}`, detail: tool.detail, tool })), { placeHolder: 'Run a Yana tool' });
		if (picked) runTool(picked.tool);
	}));
}

module.exports = { id: 'tools', activate, TOOLS };

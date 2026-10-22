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
	{ id: 'fix', label: 'Fix vulnerabilities', icon: 'wrench', args: ['fix', '--dry-run'], detail: 'Auto-apply safe fixes for known findings' },
	{ id: 'mcp', label: 'MCP servers', icon: 'plug', args: ['mcp', 'list'], detail: 'Inspect and manage Model Context Protocol servers' },
	{ id: 'skill', label: 'Skills catalog', icon: 'tools', args: ['skill', 'list'], detail: 'Inspect installed agent skills and capabilities' },
	{ id: 'skillquality', label: 'Skill quality ledger', icon: 'verified', args: ['skill-quality', 'show'], detail: 'Quality score and verdicts from real tasks' },
	{ id: 'plugin', label: 'Plugin hooks', icon: 'extensions', args: ['plugin', 'list'], detail: 'List active plugin hooks and guards' },
	{ id: 'connector', label: 'Connectors', icon: 'link', args: ['connector', 'list'], detail: 'Connector registry and permissions' },
	{ id: 'memory', label: 'Shared memory', icon: 'database', args: ['memory', 'list'], detail: 'L3 shared memory and workspace facts' },
	{ id: 'vault', label: 'Knowledge vault', icon: 'archive', args: ['vault', 'list'], detail: 'Vietnamese-first knowledge vault' },
	{ id: 'graph', label: 'Knowledge graph', icon: 'type-hierarchy', args: ['graph', 'show'], detail: 'Build and inspect project knowledge graph' },
	{ id: 'workspace', label: 'Workspace context', icon: 'root-folder', args: ['workspace', 'status'], detail: 'Unified local workspace context and state' },
	{ id: 'evidence', label: 'Evidence verification', icon: 'shield-check', args: ['evidence', 'verify'], detail: 'Verify signed receipts and truth gate evidence' },
	{ id: 'provenance', label: 'Provenance check', icon: 'file-submodule', args: ['provenance', 'check'], detail: 'Verify ported code vendor source and attribution' },
	{ id: 'eval', label: 'Evaluate task evidence', icon: 'checklist', args: ['eval', 'check'], detail: 'Evaluate task evidence against schema' },
	{ id: 'spec', label: 'Spec validation', icon: 'file-code', args: ['spec', 'validate'], detail: 'Validate task spec files against schema' },
	{ id: 'design', label: 'Design tokens', icon: 'symbol-color', args: ['design', 'extract'], detail: 'Extract design tokens, colors and CSS variables' },
	{ id: 'mission', label: 'Mission tracker', icon: 'rocket', args: ['mission', 'list'], detail: 'Parallel mission orchestrator and agent tasks' },
	{ id: 'route', label: 'Task router', icon: 'git-merge', args: ['route', 'explain'], detail: 'Explain task routing decisions' },
	{ id: 'research', label: 'Research claims', icon: 'book', args: ['research', 'list'], detail: 'Research claims with confidence and dates' },
	{ id: 'bus', label: 'Agent message bus', icon: 'radio-tower', args: ['bus', 'inbox'], detail: 'Inspect agent message bus and inbox' },
	{ id: 'compact', label: 'Bash output compaction', icon: 'fold', args: ['compact', '--help'], detail: 'Native bash output compaction status' },
	{ id: 'filescan', label: 'File malware check', icon: 'shield', args: ['filescan', '--help'], detail: 'On-demand file integrity and malware check' },
	{ id: 'watch', label: 'File watcher', icon: 'eye', args: ['watch', 'status'], detail: 'Live file watcher for skills, agents and rules' },
	{ id: 'init', label: 'Init project', icon: 'sparkle', args: ['init', '--help'], detail: 'Initialize Yana AI in a project' },
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

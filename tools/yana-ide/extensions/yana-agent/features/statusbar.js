'use strict';
// Status bar: trạng thái runtime thật, chính sách chạy lệnh, và tỷ lệ allow/deny trong audit-chain.

const vscode = require('vscode');
const { runtimeVersion } = require('../runtime');
const { binary, runJson } = require('../cli');

const AUDIT_WINDOW = 500; // khớp governance.js
const REFRESH_MS = 60000; // làm mới audit mỗi phút; đọc file cục bộ nên rẻ

function activate(context) {
	const runtimeItem = vscode.window.createStatusBarItem('yana.runtime', vscode.StatusBarAlignment.Left, 100);
	runtimeItem.name = 'Yana Runtime';
	runtimeItem.command = { command: 'yana.settings.open', arguments: ['models'], title: 'Yana Settings' };

	const policyItem = vscode.window.createStatusBarItem('yana.policy', vscode.StatusBarAlignment.Left, 99);
	policyItem.name = 'Yana Policy';
	policyItem.text = '$(shield) Policy: SUPERVISED [ALLOW: read · REQUIRE: run]';
	policyItem.tooltip = 'yana-rt chat: read_file is allowed; run_command always needs human approval through the check_command() guard';
	policyItem.command = 'workbench.view.extension.yana-explorer';

	const auditItem = vscode.window.createStatusBarItem('yana.audit', vscode.StatusBarAlignment.Left, 98);
	auditItem.name = 'Yana Audit';
	auditItem.command = 'workbench.view.extension.yana-explorer';

	async function refreshRuntime() {
		const bin = binary();
		const version = await runtimeVersion(bin);
		runtimeItem.text = bin ? `$(pulse) Yana Runtime v${version || '?'}` : '$(error) Yana Runtime: not found';
		runtimeItem.tooltip = bin || 'Set yana.runtimePath in settings';
		runtimeItem.backgroundColor = bin ? undefined : new vscode.ThemeColor('statusBarItem.errorBackground');
		runtimeItem.show();
		policyItem.show();
	}

	async function refreshAudit() {
		try {
			const summary = await runJson(['observability', 'show', '--json', '--last', String(AUDIT_WINDOW)]);
			const decisions = summary?.by_decision || {};
			const denied = (decisions.deny || 0) + (decisions.block || 0);
			auditItem.text = `$(output) Audit ${decisions.allow || 0}✓ ${denied}✕`;
			auditItem.tooltip = `${summary?.total ?? 0} most recent tool calls in .claude/state/audit-chain.log`;
			auditItem.show();
		} catch {
			auditItem.hide();
		}
	}

	refreshRuntime();
	refreshAudit();
	const timer = setInterval(refreshAudit, REFRESH_MS);
	context.subscriptions.push(
		runtimeItem, policyItem, auditItem,
		{ dispose: () => clearInterval(timer) },
		vscode.commands.registerCommand('yana.runtime.refresh', refreshRuntime),
		vscode.workspace.onDidGrantWorkspaceTrust(refreshAudit),
		vscode.workspace.onDidChangeConfiguration(event => event.affectsConfiguration('yana') && refreshRuntime()),
	);
}

module.exports = { id: 'statusbar', activate };

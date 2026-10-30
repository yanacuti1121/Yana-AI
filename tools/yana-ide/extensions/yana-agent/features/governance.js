'use strict';
// Governance: approval đang chờ, capability lease, và thống kê audit-chain (yana-rt authority / lease / observability).

const vscode = require('vscode');
const changes = require('./changes');
const { runJson } = require('../cli');
const { YanaTree, infoItem, group } = require('./tree');
const { clean } = require('./status-model');

const AUDIT_WINDOW = 500; // số dòng audit gần nhất được tóm tắt, khớp mặc định của `observability show`
const DECISION_ICON = { allow: 'pass', deny: 'error', warn: 'warning', block: 'error' };

function leaf(label, icon, description, tooltip) {
	const item = infoItem(label, icon, tooltip);
	item.description = description;
	return item;
}

// Bản ghi chờ duyệt lưu cả hội thoại và nguyên lời gọi công cụ (kể cả dòng lệnh, có thể chứa khóa).
// Chỉ lấy vài trường an toàn để hiện; không bao giờ đưa cả bản ghi vào tooltip.
const MAX_APPROVAL_FIELD = 80;

async function approvalsGroup() {
	const list = await runJson(['authority', 'pending-approvals', '--json']);
	const items = (Array.isArray(list) ? list : []).map(entry => {
		const label = clean(entry?.pending_call?.name || entry?.approval_id, MAX_APPROVAL_FIELD) || 'approval';
		const reason = clean(entry?.authority_reason, MAX_APPROVAL_FIELD * 2);
		return leaf(label, 'shield', clean(entry?.expires_at, MAX_APPROVAL_FIELD), `${reason}\nApprove or deny at the terminal (yana-rt authority).`);
	});
	return group('Pending approvals', 'shield', items);
}

async function leasesGroup() {
	const list = await runJson(['lease', 'list', '--json']);
	const items = (Array.isArray(list) ? list : []).map(entry => {
		const item = leaf(entry.capability || entry.scope || entry.id || 'lease', 'key', entry.expires_at || '', JSON.stringify(entry, null, 2));
		if (entry.id) {
			item.contextValue = 'yana.lease';
			item.leaseId = entry.id;
		}
		return item;
	});
	return group('Capability lease', 'key', items);
}

async function auditGroup() {
	const summary = await runJson(['observability', 'show', '--json', '--last', String(AUDIT_WINDOW)]);
	const decisions = Object.entries(summary?.by_decision || {}).map(([name, count]) =>
		leaf(name, DECISION_ICON[name] || 'circle-outline', String(count)));
	const tools = Object.entries(summary?.by_tool || {})
		.sort((a, b) => b[1] - a[1])
		.map(([name, count]) => leaf(name, 'tools', String(count)));
	return group(`Audit (${summary?.total ?? 0} most recent)`, 'output', [
		group('By decision', 'law', decisions),
		group('By tool', 'tools', tools),
	], '');
}

async function loadGovernance() {
	return Promise.all([approvalsGroup(), leasesGroup(), auditGroup()]);
}

function activate(context) {
	const tree = new YanaTree(loadGovernance, 'No governance data.');
	context.subscriptions.push(
		vscode.window.createTreeView('yana.governance', { treeDataProvider: tree, showCollapseAll: true }),
		vscode.commands.registerCommand('yana.governance.refresh', () => tree.refresh()),
		vscode.commands.registerCommand('yana.governance.revokeLease', async item => {
			if (!item?.leaseId) return;
			const answer = await vscode.window.showWarningMessage(`Revoke lease ${item.leaseId}? It stops matching on the next authority check.`, { modal: true }, 'Revoke');
			if (answer !== 'Revoke') return;
			try {
				await runJson(['lease', 'revoke', item.leaseId, '--json']);
			} catch (error) {
				vscode.window.showErrorMessage(`Yana: ${error.message}`);
			}
			changes.fire('governance');
		}),
		changes.listen(['governance', 'trust'], () => tree.refresh()),
	);
	return { refresh: () => tree.refresh() };
}

module.exports = { id: 'governance', activate };

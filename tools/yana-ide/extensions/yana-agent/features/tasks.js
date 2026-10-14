'use strict';
// Tasks: đọc và thao tác kho task thật của `yana-rt task` (src/task.rs). Done bắt buộc có evidence.

const vscode = require('vscode');
const changes = require('./changes');
const { runJson } = require('../cli');
const { YanaTree, group } = require('./tree');

const STATUS_ICON = { open: 'circle-large-outline', in_progress: 'sync', blocked: 'debug-pause', done: 'pass-filled' };
const STATUS_ORDER = ['in_progress', 'open', 'blocked', 'done'];
const STATUS_LABEL = { in_progress: 'In progress', open: 'Open', blocked: 'Blocked', done: 'Done' };

function taskItem(task) {
	const status = task.blocked ? 'blocked' : task.status;
	const item = new vscode.TreeItem(task.name, vscode.TreeItemCollapsibleState.None);
	item.id = `yana.task.${task.id}`;
	item.iconPath = new vscode.ThemeIcon(STATUS_ICON[status] || 'circle-large-outline');
	item.description = task.scope || '';
	const lines = [`${task.id} · ${status}`, `Created: ${task.created_at}`];
	if (task.blocked_by?.length) lines.push(`Blocked by: ${task.blocked_by.join(', ')}`);
	if (task.evidence?.raw) lines.push(`Evidence: ${task.evidence.raw}`);
	item.tooltip = lines.join('\n');
	item.contextValue = status === 'done' ? 'yana.task.done' : 'yana.task.open';
	item.taskId = task.id;
	return item;
}

async function loadTasks() {
	const data = await runJson(['task', 'list', '--json']);
	const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
	const byStatus = new Map(STATUS_ORDER.map(status => [status, []]));
	for (const task of tasks) {
		const status = task.blocked ? 'blocked' : task.status;
		(byStatus.get(status) || byStatus.get('open')).push(taskItem(task));
	}
	return STATUS_ORDER.filter(status => byStatus.get(status).length).map(status => group(STATUS_LABEL[status], STATUS_ICON[status], byStatus.get(status)));
}

async function guarded(action, tree) {
	try {
		await action();
	} catch (error) {
		vscode.window.showErrorMessage(error.message);
	}
	changes.fire('tasks'); // cây này và bảng Tasks trong tab cùng nạp lại
}

function activate(context) {
	const tree = new YanaTree(loadTasks, 'No tasks yet. Click + to create one.');
	context.subscriptions.push(
		vscode.window.createTreeView('yana.tasks', { treeDataProvider: tree, showCollapseAll: true }),
		vscode.commands.registerCommand('yana.tasks.refresh', () => tree.refresh()),
		vscode.commands.registerCommand('yana.tasks.create', async () => {
			const name = await vscode.window.showInputBox({ prompt: 'Task name', ignoreFocusOut: true });
			if (!name?.trim()) return;
			const scope = await vscode.window.showInputBox({ prompt: 'Scope (leave empty if none)', ignoreFocusOut: true });
			const args = ['task', 'create', name.trim(), '--json'];
			if (scope?.trim()) args.push('--scope', scope.trim());
			await guarded(() => runJson(args), tree);
		}),
		vscode.commands.registerCommand('yana.tasks.done', async item => {
			if (!item?.taskId) return;
			const evidence = await vscode.window.showInputBox({ prompt: 'Evidence: the command you ran and its result, for example "cargo test: 42 passed"', ignoreFocusOut: true });
			if (!evidence?.trim()) return;
			await guarded(() => runJson(['task', 'done', item.taskId, '--evidence', evidence.trim(), '--json']), tree);
		}),
		vscode.commands.registerCommand('yana.tasks.drop', async item => {
			if (!item?.taskId) return;
			const answer = await vscode.window.showWarningMessage(`Drop task "${item.label}"?`, { modal: true }, 'Drop task');
			if (answer !== 'Drop task') return;
			await guarded(() => runJson(['task', 'drop', item.taskId, '--json']), tree);
		}),
		changes.listen(['tasks', 'trust'], () => tree.refresh()),
	);
}

module.exports = { id: 'tasks', activate };

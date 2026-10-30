'use strict';
// View Status: một chỗ cho thấy cái gì đang chạy và cái gì đang chờ người, đọc từ `yana-rt status --json`,
// cùng nguồn với app notch và menu bar. Chỉ đọc: duyệt hay từ chối vẫn làm ở terminal.

const vscode = require('vscode');
const changes = require('./changes');
const { runJson } = require('../cli');
const { YanaTree, infoItem, group } = require('./tree');
const { toRows, failureRows } = require('./status-model');

const REFRESH_MS = 3000; // chỉ chạy khi view đang hiện, để không gọi yana-rt khi không ai nhìn

function toItem(row) {
	if (row.children) return group(row.label, row.icon, row.children.map(toItem), row.description);
	const item = infoItem(row.label, row.icon, row.tooltip);
	if (row.description) item.description = row.description;
	return item;
}

function activate(context) {
	let view;
	let timer;

	async function load() {
		let snapshot;
		try {
			snapshot = await runJson(['status', '--json']);
		} catch (error) {
			const rows = failureRows(error);
			if (!rows) throw error;
			if (view) view.badge = undefined;
			return rows.map(toItem);
		}
		const { rows, attention } = toRows(snapshot, new Date());
		if (view) view.badge = attention > 0 ? { value: attention, tooltip: `${attention} thing(s) need you` } : undefined;
		return rows.map(toItem);
	}

	const tree = new YanaTree(load, 'No status yet.');
	view = vscode.window.createTreeView('yana.status', { treeDataProvider: tree, showCollapseAll: false });

	const stop = () => { if (timer) { clearInterval(timer); timer = undefined; } };
	const start = () => { if (!timer) timer = setInterval(() => tree.refresh(), REFRESH_MS); };
	context.subscriptions.push(
		view,
		{ dispose: stop },
		view.onDidChangeVisibility(event => {
			if (event.visible) { tree.refresh(); start(); } else stop();
		}),
		vscode.commands.registerCommand('yana.status.refresh', () => tree.refresh()),
		changes.listen(['governance', 'trust'], () => tree.refresh()),
	);
	if (view.visible) start();
	return { refresh: () => tree.refresh() };
}

module.exports = { id: 'status', activate };

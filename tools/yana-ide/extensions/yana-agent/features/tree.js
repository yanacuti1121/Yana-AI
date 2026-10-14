'use strict';
// Khung dùng chung cho các tree view của Yana: tải dữ liệu qua loader, hiện lỗi và trạng thái trống rõ ràng.

const vscode = require('vscode');

const ERROR_HINTS = {
	'no-binary': 'yana-rt not found. Set yana.runtimePath in settings.',
	'no-folder': 'Open a folder to see Yana data.',
	'untrusted': 'Trust this folder (Manage in the Restricted Mode bar) to load Yana data.',
};

function infoItem(label, icon, tooltip) {
	const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
	item.iconPath = new vscode.ThemeIcon(icon);
	item.tooltip = tooltip || label;
	item.contextValue = 'yana.info';
	return item;
}

// loader(): Promise<TreeItem[]>; mỗi TreeItem có thể kèm .children (mảng TreeItem).
class YanaTree {
	constructor(loader, emptyLabel) {
		this.loader = loader;
		this.emptyLabel = emptyLabel;
		this.changed = new vscode.EventEmitter();
		this.onDidChangeTreeData = this.changed.event;
	}

	refresh() {
		this.changed.fire(undefined);
	}

	getTreeItem(item) {
		return item;
	}

	async getChildren(parent) {
		if (parent) return parent.children || [];
		try {
			const items = await this.loader();
			return items.length ? items : [infoItem(this.emptyLabel, 'info')];
		} catch (error) {
			const hint = ERROR_HINTS[error.kind] || error.message;
			return [infoItem(hint, error.kind === 'untrusted' ? 'shield' : 'warning', error.message)];
		}
	}
}

function group(label, icon, children, description) {
	const item = new vscode.TreeItem(label, children.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
	item.iconPath = new vscode.ThemeIcon(icon);
	item.description = description ?? String(children.length);
	item.children = children;
	return item;
}

module.exports = { YanaTree, infoItem, group };

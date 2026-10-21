'use strict';
// Cầu nối window.studio cho hai màn cũ Tasks và Permissions. Logic chạy yana-rt là host/tasks.cjs và
// host/permissions.cjs của app cũ (Node thuần, không đổi); ở đây chỉ chọn binary theo cấu hình của IDE và
// bắt root phải là thư mục đang mở. Lệnh task/lease chạy trong thư mục dự án nên cần thư mục đã trust.

const vscode = require('vscode');
const { Tasks } = require('../host/tasks.cjs');
const { Permissions } = require('../host/permissions.cjs');
const { binary, workspaceRoot } = require('../cli');
const changes = require('./changes');

const tasks = new Tasks(() => binary());
const permissions = new Permissions(() => binary());

function requireRoot(root) {
	const current = workspaceRoot();
	if (!current || root !== current) throw new Error('This project is not the folder open in the IDE');
	if (!vscode.workspace.isTrusted) throw new Error('Trust this folder before using tasks and permissions');
	return root;
}

// Lệnh làm đổi dữ liệu: sau khi chạy xong phải báo để cây bên trái và các tab khác nạp lại.
const MUTATIONS = { tasks: ['taskCreate', 'taskDone', 'taskDrop', 'taskDepend'], governance: ['leaseGrant', 'leaseRevoke'] };

const HANDLERS = {
	taskList: (_context, root) => tasks.list(requireRoot(root)),
	taskCreate: (_context, root, name, scope) => tasks.create(requireRoot(root), name, scope),
	taskDone: (_context, root, id, evidence) => tasks.done(requireRoot(root), id, evidence),
	taskDrop: (_context, root, id) => tasks.drop(requireRoot(root), id),
	taskDepend: (_context, root, id, on, type) => tasks.depend(requireRoot(root), id, on, type),
	leaseList: (_context, root) => permissions.leaseList(requireRoot(root)),
	leaseRevoke: (_context, root, id) => permissions.leaseRevoke(requireRoot(root), id),
	leaseGrant: (_context, root, options) => permissions.leaseGrant(requireRoot(root), options),
	pendingApprovals: (_context, root) => permissions.pendingApprovals(requireRoot(root)),
};

for (const [kind, names] of Object.entries(MUTATIONS)) {
	for (const name of names) {
		const run = HANDLERS[name];
		HANDLERS[name] = async (...args) => {
			const result = await run(...args);
			changes.fire(kind);
			return result;
		};
	}
}

module.exports = { HANDLERS };

'use strict';
// yana-rt chỉ lưu được lệnh đang chờ duyệt khi thư mục dự án có file đánh dấu khoá
// `.claude/state/locking-protocol-version` = "flock-v1" (src/flock_v1.rs, protocol_is_active).
// Dự án ngoài repo Yana AI thường chưa có file này, nên khi model muốn chạy lệnh thì yana-rt báo
// "cannot persist pending approval" thay vì hỏi người dùng. Ở đây giải thích lỗi đó và, chỉ khi người
// dùng bấm nút, tạo đúng file đánh dấu trong dự án. Không tự ghi vào dự án khi chưa được cho phép.

const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');

const MARKER = path.join('.claude', 'state', 'locking-protocol-version');
const PROTOCOL = 'flock-v1';
const ENABLE = 'Turn on approvals in this project';

function isActive(root) {
	try {
		return fs.readFileSync(path.join(root, MARKER), 'utf8').trim() === PROTOCOL;
	} catch {
		return false;
	}
}

// Ghi file đánh dấu; từ chối nếu đường dẫn là symlink (giống yana-rt, không đi theo link ra ngoài dự án).
function enable(root) {
	const file = path.join(root, MARKER);
	const dir = path.dirname(file);
	fs.mkdirSync(dir, { recursive: true });
	for (const target of [path.join(root, '.claude'), dir]) {
		if (fs.lstatSync(target).isSymbolicLink()) throw new Error(`${target} is a symlink`);
	}
	if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error(`${file} is a symlink`);
	fs.writeFileSync(file, `${PROTOCOL}\n`, { mode: 0o644 });
}

let offering = false;

// Gọi khi một lượt chat lỗi vì không lưu được lệnh chờ duyệt.
async function offer(root) {
	if (!root || offering || isActive(root)) return;
	offering = true;
	try {
		const answer = await vscode.window.showWarningMessage(
			'Yana could not ask for your approval: this project has no Yana approval store yet. '
			+ `Turning it on adds one small file (${MARKER}). Then send your message again.`,
			ENABLE);
		if (answer !== ENABLE) return;
		enable(root);
		vscode.window.showInformationMessage('Approvals are on for this project. Send your message again.');
	} catch (error) {
		vscode.window.showErrorMessage(`Yana: could not turn on approvals: ${error.message}`);
	} finally {
		offering = false;
	}
}

module.exports = { offer, isActive, enable };

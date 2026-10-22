'use strict';
// Cửa sổ "Audit Chain Log": đọc nhật ký thật của dự án (.claude/state/audit-chain.log, mỗi dòng một JSON do hook
// audit-log ghi, có chuỗi băm prev_hash/hash) và gửi bản tóm tắt cho giao diện. Phần phân tích (`summarizeAuditLog`)
// là hàm thuần để test được; phần còn lại đọc file và xuất file qua hộp thoại lưu (người dùng chọn = đồng ý).

const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');

const LOG_RELATIVE_PATH = path.join('.claude', 'state', 'audit-chain.log');
const MAX_ENTRIES = 200; // số dòng mới nhất gửi cho giao diện
const MAX_READ_BYTES = 4 * 1024 * 1024; // chỉ đọc phần đuôi của file; nhật ký có thể rất dài
const MAX_EXPORT_BYTES = 200 * 1024 * 1024; // chặn xuất một file bất thường lớn
const GENESIS = 'GENESIS'; // prev_hash của dòng đầu tiên (xem audit-hardening-policy.md)
const MAX_TEXT_CHARS = 120;
const LINE_BREAKS = new RegExp('[\r\n\u2028\u2029]+', 'g'); // gồm cả hai dấu ngắt dòng Unicode

const text = value => (typeof value === 'string' ? value.replace(LINE_BREAKS, ' ').slice(0, MAX_TEXT_CHARS) : '');

function parseLine(line) {
	try {
		const entry = JSON.parse(line);
		return entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : null;
	} catch {
		return null;
	}
}

// Chỉ giữ thời gian, hook, công cụ, quyết định: `input` có thể chứa nội dung nhạy cảm nên không bao giờ rời file.
function toView(entry) {
	return { ts: text(entry.ts), hook: text(entry.hook), tool: text(entry.tool), decision: text(entry.decision).toLowerCase() || 'unknown' };
}

/**
 * Chỉ kiểm tra các dòng còn nối với nhau (prev_hash của dòng sau = hash của dòng trước). Không tính lại hash,
 * nên đây là bằng chứng "không bị xoá hoặc chèn dòng", chưa phải xác minh mật mã đầy đủ.
 */
function checkLinks(entries) {
	for (let i = 1; i < entries.length; i++) {
		if (entries[i].prev_hash !== entries[i - 1].hash) return { linked: false, brokenAt: i + 1 };
	}
	return { linked: true, brokenAt: null };
}

function summarizeAuditLog(raw) {
	const entries = [];
	let unreadable = 0;
	for (const line of String(raw ?? '').split('\n')) {
		if (!line.trim()) continue;
		const entry = parseLine(line);
		if (entry) entries.push(entry);
		else unreadable++;
	}
	const counts = {};
	for (const entry of entries) {
		const decision = toView(entry).decision;
		counts[decision] = (counts[decision] || 0) + 1;
	}
	return {
		total: entries.length,
		unreadable,
		counts,
		chain: checkLinks(entries),
		entries: entries.slice(-MAX_ENTRIES).reverse().map(toView),
	};
}

function workspaceRoot() {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

// Đọc phần đuôi của file. Nếu cắt giữa chừng thì bỏ dòng đầu bị dở.
function readTail(file) {
	const size = fs.statSync(file).size;
	const start = Math.max(0, size - MAX_READ_BYTES);
	const fd = fs.openSync(file, 'r');
	try {
		const buffer = Buffer.alloc(size - start);
		fs.readSync(fd, buffer, 0, buffer.length, start);
		const body = buffer.toString('utf8');
		return start > 0 ? body.slice(body.indexOf('\n') + 1) : body;
	} finally {
		fs.closeSync(fd);
	}
}

/** Thông điệp `audit.entries` cho giao diện. `available: false` nghĩa là dự án chưa có nhật ký. */
function loadForView(root = workspaceRoot()) {
	if (!root) return { type: 'audit.entries', available: false, reason: 'Open a folder to see its audit log.' };
	const file = path.join(root, LOG_RELATIVE_PATH);
	try {
		return { type: 'audit.entries', available: true, ...summarizeAuditLog(readTail(file)) };
	} catch (error) {
		if (error.code === 'ENOENT') return { type: 'audit.entries', available: false, reason: `No audit log yet: ${LOG_RELATIVE_PATH} is created by the Yana audit hook when it first records a tool call.` };
		return { type: 'audit.entries', available: false, reason: `Could not read the audit log: ${error.message}` };
	}
}

async function exportLog(root = workspaceRoot()) {
	if (!root) {
		vscode.window.showInformationMessage('Yana: open a folder first.');
		return;
	}
	const source = path.join(root, LOG_RELATIVE_PATH);
	let size;
	try {
		size = fs.statSync(source).size;
	} catch {
		vscode.window.showInformationMessage('Yana: this project has no audit log yet.');
		return;
	}
	if (size > MAX_EXPORT_BYTES) {
		vscode.window.showWarningMessage('Yana: the audit log is too large to export from here.');
		return;
	}
	const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(path.join(root, 'yana-audit-log.jsonl')), filters: { 'JSON Lines': ['jsonl', 'log'] }, saveLabel: 'Export audit log' });
	if (!target) return;
	try {
		await vscode.workspace.fs.copy(vscode.Uri.file(source), target, { overwrite: true });
		vscode.window.showInformationMessage(`Yana: audit log exported to ${target.fsPath}`);
	} catch (error) {
		vscode.window.showErrorMessage(`Yana: could not export the audit log: ${error.message}`);
	}
}

module.exports = { loadForView, exportLog, summarizeAuditLog, MAX_ENTRIES, GENESIS, LOG_RELATIVE_PATH };

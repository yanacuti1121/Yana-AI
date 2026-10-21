'use strict';
// Đề xuất sửa file ngay trong khung chat Yana. Model chỉ ĐỀ XUẤT (xem edit-protocol.js); file chỉ bị ghi khi người dùng
// bấm "Apply" trên đúng đề xuất đó. Mỗi lần ghi đều kiểm tra lại: thư mục đã được tin cậy, đường dẫn nằm trong dự án,
// file chưa bị sửa dở trong trình soạn thảo, và nội dung vẫn khớp với lúc đề xuất. Ghi qua WorkspaceEdit nên hoàn tác
// được bằng Undo của IDE.

const vscode = require('vscode');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { parseEdits, applyBlocks, diffLines, resolveInside } = require('./edit-protocol');

const SCHEME = 'yana-edit';
const proposals = new Map(); // id → đề xuất đang chờ người dùng duyệt (mất khi nạp lại cửa sổ)
const previews = new Map(); // uri → nội dung ảo cho trình so sánh
let log;

function currentText(file) {
	const open = vscode.workspace.textDocuments.find(document => document.uri.fsPath === file);
	if (open) return { text: open.getText(), dirty: open.isDirty };
	return { text: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, dirty: false };
}

function counts(lines) {
	return { additions: lines.filter(line => line.startsWith('+')).length, deletions: lines.filter(line => line.startsWith('-')).length };
}

// Biến câu trả lời của model thành danh sách đề xuất để panel hiển thị. Đề xuất lỗi vẫn hiện, kèm lý do, nhưng không có nút Apply.
function propose(reply, root) {
	const items = [];
	for (const edit of parseEdits(reply)) {
		const id = crypto.randomUUID();
		const resolved = resolveInside(root, edit.path);
		const base = { id, path: edit.path, lines: diffLines(edit.blocks) };
		if (resolved.error) {
			items.push({ ...base, ...counts(base.lines), ok: false, error: resolved.error });
			continue;
		}
		const { text } = currentText(resolved.file);
		const result = applyBlocks(text, edit.blocks);
		const item = { ...base, ...counts(base.lines), isNew: text === null, ok: !result.error, error: result.error || '' };
		if (item.ok) proposals.set(id, { id, root, file: resolved.file, rel: edit.path, blocks: edit.blocks, before: text, after: result.content });
		items.push(item);
	}
	return items;
}

// Mở trình so sánh của IDE: bên trái là file hiện tại, bên phải là kết quả nếu áp dụng.
async function preview(id) {
	const proposal = proposals.get(id);
	if (!proposal) throw new Error('This proposal is no longer available. Ask Yana again.');
	const left = vscode.Uri.from({ scheme: SCHEME, path: `/before/${proposal.rel}`, query: id });
	const right = vscode.Uri.from({ scheme: SCHEME, path: `/after/${proposal.rel}`, query: id });
	previews.set(left.toString(), proposal.before || '');
	previews.set(right.toString(), proposal.after);
	await vscode.commands.executeCommand('vscode.diff', left, right, `Yana edit: ${proposal.rel}`);
}

// Ghi file sau khi người dùng bấm Apply. Trả về { ok, error? }.
async function apply(id) {
	const proposal = proposals.get(id);
	if (!proposal) return { ok: false, error: 'This proposal is no longer available. Ask Yana again.' };
	if (!vscode.workspace.isTrusted) return { ok: false, error: 'Trust this folder before applying changes.' };
	const resolved = resolveInside(proposal.root, proposal.rel);
	if (resolved.error) return { ok: false, error: resolved.error };
	const now = currentText(resolved.file);
	if (now.dirty) return { ok: false, error: 'The file has unsaved changes in the editor. Save or revert it first.' };
	if (now.text !== proposal.before) return { ok: false, error: 'The file changed since this was proposed. Ask Yana again.' };
	const edit = new vscode.WorkspaceEdit();
	const uri = vscode.Uri.file(resolved.file);
	if (now.text === null) {
		edit.createFile(uri, { ignoreIfExists: false });
		edit.insert(uri, new vscode.Position(0, 0), proposal.after);
	} else {
		const document = await vscode.workspace.openTextDocument(uri);
		edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(now.text.length)), proposal.after);
	}
	if (!(await vscode.workspace.applyEdit(edit))) return { ok: false, error: 'The editor refused the change.' };
	const saved = await vscode.workspace.openTextDocument(uri);
	await saved.save();
	proposals.delete(id);
	log?.info(`edit applied by user: ${proposal.rel}`);
	return { ok: true };
}

function reject(id) {
	const proposal = proposals.get(id);
	proposals.delete(id);
	if (proposal) log?.info(`edit rejected by user: ${proposal.rel}`);
}

function activate(context) {
	log = vscode.window.createOutputChannel('Yana Edits', { log: true });
	context.subscriptions.push(
		log,
		vscode.workspace.registerTextDocumentContentProvider(SCHEME, { provideTextDocumentContent: uri => previews.get(uri.toString()) || '' }),
	);
}

module.exports = { id: 'edits', activate, propose, preview, apply, reject };

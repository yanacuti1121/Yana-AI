'use strict';
// Giao thức "đề xuất sửa file" trong khung chat. Model không tự ghi file: nó viết các khối SEARCH/REPLACE (định dạng
// kiểu Aider, Apache-2.0, đủ đơn giản để mọi provider làm được) và người dùng duyệt từng khối. File này chỉ có logic
// thuần (không dùng vscode): phân tích khối, kiểm tra đường dẫn, áp dụng thử và tính phần thay đổi để hiển thị.

const path = require('node:path');
const fs = require('node:fs');

const MAX_FILES = 20; // số file tối đa một câu trả lời được đề xuất
const MAX_BLOCK_CHARS = 200000; // mỗi vế SEARCH hoặc REPLACE
const MAX_DIFF_LINES = 300; // số dòng thay đổi hiển thị trong thẻ

const FENCE = /```yana-edit[ \t]+path=([^\n]+)\n([\s\S]*?)\n```/g;
const SECTION = /<<<<<<< SEARCH\n([\s\S]*?)\n?=======\n([\s\S]*?)\n?>>>>>>> REPLACE/g;

// Theo 03-privilege-isolation và 49-immutable-infrastructure: model không được sửa file bí mật hay hạ tầng lõi.
const PROTECTED = [
	/(^|\/)\.env($|\.)/i,
	/\.(pem|key|p12|pfx|crt)$/i,
	/(^|\/)(id_rsa|id_ed25519)(\.pub)?$/,
	/(^|\/)\.(git|ssh|aws|kube)(\/|$)/,
	/(^|\/)\.claude(\/|$)/,
	/(^|\/)core\/(rules|hooks|gates|scripts)(\/|$)/,
	/(^|\/)(node_modules)(\/|$)/,
];

const EDIT_INSTRUCTIONS = [
	'You can propose changes to files in the user\'s project, but you cannot write files yourself: the user reviews and applies each change.',
	'Only propose edits when the user asks for a code change. Read the file first so your SEARCH text matches it exactly.',
	'To propose a change, put it in a fenced block exactly like this, with nothing else inside the fence:',
	'```yana-edit path=src/example.js',
	'<<<<<<< SEARCH',
	'exact existing lines to replace (must appear exactly once in the file)',
	'=======',
	'the new lines',
	'>>>>>>> REPLACE',
	'```',
	'Rules: the path is relative to the project root. Use one fence per file; several SEARCH/REPLACE sections are allowed inside it.',
	'To create a new file, leave SEARCH empty. Keep SEARCH short but unique. Never edit secrets, .env files or git internals.',
	'Explain the change briefly outside the fence.',
].join('\n');

// Trả về lý do không hợp lệ, hoặc '' nếu đường dẫn tương đối an toàn.
function checkRelativePath(rel) {
	if (!rel || rel.includes('\0') || rel.length > 400) return 'invalid path';
	if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || rel.includes('\\')) return 'path must be relative to the project';
	const clean = path.posix.normalize(rel);
	if (clean.startsWith('..') || clean.split('/').includes('..')) return 'path leaves the project';
	if (PROTECTED.some(pattern => pattern.test(clean))) return 'this file is protected and cannot be edited by the assistant';
	return '';
}

// Phân tích câu trả lời của model thành danh sách { path, blocks:[{search, replace}] }, gộp theo file.
function parseEdits(reply) {
	const byPath = new Map();
	for (const fence of String(reply || '').matchAll(FENCE)) {
		const rel = fence[1].trim();
		const blocks = [...fence[2].matchAll(SECTION)].map(match => ({ search: match[1], replace: match[2] }));
		if (!blocks.length) continue;
		const entry = byPath.get(rel) || { path: rel, blocks: [] };
		entry.blocks.push(...blocks);
		byPath.set(rel, entry);
	}
	return [...byPath.values()].slice(0, MAX_FILES);
}

function occurrences(text, needle) {
	let count = 0;
	let from = 0;
	for (;;) {
		const at = text.indexOf(needle, from);
		if (at < 0) return count;
		count += 1;
		from = at + needle.length;
	}
}

// Áp dụng thử các khối lên nội dung hiện tại (null nếu file chưa có). Không ghi gì.
function applyBlocks(original, blocks) {
	let content = original === null ? '' : original;
	for (const [index, block] of blocks.entries()) {
		if (block.search.length > MAX_BLOCK_CHARS || block.replace.length > MAX_BLOCK_CHARS) return { error: 'change is too large' };
		if (block.search === '') {
			if (original !== null) return { error: 'SEARCH is empty but the file already exists' };
			content = block.replace;
			continue;
		}
		const found = occurrences(content, block.search);
		if (found === 0) return { error: `section ${index + 1}: the SEARCH text was not found in the file` };
		if (found > 1) return { error: `section ${index + 1}: the SEARCH text appears ${found} times, it must be unique` };
		content = content.replace(block.search, () => block.replace);
	}
	return { content };
}

// Các dòng thay đổi để hiển thị: đúng những gì sẽ bị thay (không bịa ngữ cảnh).
function diffLines(blocks) {
	const lines = [];
	for (const block of blocks) {
		if (block.search !== '') lines.push(...block.search.split('\n').map(line => `-${line}`));
		lines.push(...block.replace.split('\n').map(line => `+${line}`));
	}
	return lines.length > MAX_DIFF_LINES ? [...lines.slice(0, MAX_DIFF_LINES), `… ${lines.length - MAX_DIFF_LINES} more lines`] : lines;
}

// Đường dẫn tuyệt đối trong dự án; từ chối nếu thoát khỏi thư mục dự án kể cả qua symlink.
function resolveInside(root, rel) {
	const reason = checkRelativePath(rel);
	if (reason) return { error: reason };
	const realRoot = fs.realpathSync(root);
	const target = path.resolve(realRoot, rel);
	let probe = target;
	while (!fs.existsSync(probe) && probe !== realRoot) probe = path.dirname(probe);
	const realProbe = fs.realpathSync(probe);
	if (realProbe !== realRoot && !realProbe.startsWith(realRoot + path.sep)) return { error: 'path leaves the project' };
	if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) return { error: 'symbolic links cannot be edited' };
	return { file: target };
}

module.exports = { EDIT_INSTRUCTIONS, MAX_FILES, parseEdits, applyBlocks, diffLines, checkRelativePath, resolveInside };

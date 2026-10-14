'use strict';
// Trang "Third-Party Components": cho người dùng biết app có chương trình của bên thứ ba nào đi kèm, của ai, giấy phép gì.
// Danh sách lấy từ product.json (`bundledTools`), cùng nguồn với bước đóng gói, nên không lệch khi nâng phiên bản.

const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');

const MAX_PRODUCT_BYTES = 2 * 1024 * 1024; // product.json là file của chính ta; giới hạn chỉ để một file hỏng không làm treo
const LICENSE_FILE = 'LICENSE';
const NOTICES_FILE = 'THIRD_PARTY_NOTICES.md';
const LINE_BREAKS = new RegExp('[\r\n\u2028\u2029]+', 'g'); // gồm cả hai dấu ngắt dòng Unicode
const HTTPS_URL = /^https:\/\/[^\s)<>`]+$/;

// Giá trị lấy từ product.json là dữ liệu, không phải Markdown: gộp thành một dòng và bỏ ký tự mở thẻ để không tạo
// được tiêu đề, đường kẻ hay link mới.
function oneLine(value) {
	return String(value ?? '').replace(LINE_BREAKS, ' ').replace(/[`<>]/g, '').trim();
}

function httpsUrl(value) {
	const url = oneLine(value);
	return HTTPS_URL.test(url) ? url : '';
}

function fileLines(tool, options) {
	const dir = path.join(options.bundledDir, oneLine(tool.name));
	const found = [[LICENSE_FILE, 'Giấy phép (LICENSE)'], [NOTICES_FILE, 'Thông báo về thư viện mà chương trình này dùng (THIRD_PARTY_NOTICES.md)']]
		.map(([file, label]) => ({ file: path.join(dir, file), label }))
		.filter(entry => options.exists(entry.file));
	if (found.length === 0) return ['- Tệp giấy phép: chưa có trong bản này (not included in this build).'];
	return found.map(entry => `- [${entry.label}](${options.toLink(entry.file)})`);
}

function toolSection(tool, options) {
	const lines = [`### ${oneLine(tool.name)} ${oneLine(tool.version)}`, ''];
	if (tool.author) lines.push(`- Tác giả: ${oneLine(tool.author)}`);
	if (tool.license) lines.push(`- Giấy phép: ${oneLine(tool.license)}`);
	const repo = httpsUrl(tool.repo);
	if (repo) lines.push(`- Nguồn: ${repo}`);
	if (tool.description) lines.push(`- Dùng để: ${oneLine(tool.description)}`);
	return [...lines, ...fileLines(tool, options), ''].join('\n');
}

/**
 * @param {{ nameLong?: string, bundledTools?: object[] }} product nội dung product.json
 * @param {{ bundledDir: string, exists: (file: string) => boolean, toLink: (file: string) => string }} options
 */
function buildCreditsMarkdown(product, options) {
	const name = oneLine(product?.nameLong) || 'Yana Studio';
	const tools = Array.isArray(product?.bundledTools) ? product.bundledTools : [];
	const parts = [
		'# Thành phần của bên thứ ba',
		'',
		`${name} được xây dựng trên **Code - OSS** (Microsoft, giấy phép MIT). Toàn bộ thông báo bản quyền nằm trong \`ThirdPartyNotices.txt\` đi kèm ứng dụng.`,
		'',
		'## Đi kèm trong ứng dụng',
		'',
	];
	if (tools.length === 0) {
		parts.push('Bản này không đi kèm chương trình riêng nào của bên thứ ba.', '');
	} else {
		parts.push('Các chương trình dưới đây là của tác giả gốc. Ứng dụng giữ nguyên vẹn file, giấy phép và chữ ký của họ, không sửa.', '');
		for (const tool of tools) parts.push(toolSection(tool, options));
	}
	return parts.join('\n');
}

function readProduct(appRoot) {
	const file = path.join(appRoot, 'product.json');
	if (fs.statSync(file).size > MAX_PRODUCT_BYTES) throw new Error('product.json is unexpectedly large.');
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Bản đóng gói: <appRoot>/bundledTools. Chạy từ mã nguồn: <repo>/.build/bundledTools.
function findBundledDir(appRoot) {
	const candidates = [path.join(appRoot, 'bundledTools'), path.join(appRoot, '.build', 'bundledTools')];
	return candidates.find(dir => fs.existsSync(dir)) ?? candidates[0];
}

async function open() {
	try {
		const appRoot = vscode.env.appRoot;
		const markdown = buildCreditsMarkdown(readProduct(appRoot), {
			bundledDir: findBundledDir(appRoot),
			exists: file => fs.existsSync(file),
			toLink: file => vscode.Uri.file(file).toString(),
		});
		const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: markdown });
		await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
	} catch (error) {
		vscode.window.showWarningMessage(`Yana: could not show third-party components: ${error.message}`);
	}
}

function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('yana.credits.open', open));
}

module.exports = { id: 'credits', activate, buildCreditsMarkdown };

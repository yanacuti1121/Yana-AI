'use strict';
// Báo cáo PDF bằng Typst từ Markdown. Không phụ thuộc vscode để test được bằng Typst thật.
// An toàn: mọi chữ của người dùng đi vào Typst dưới dạng chuỗi ký tự đã escape (`#"..."`), nên không thể chèn mã Typst
// (`#read`, `#import`, `#panic`...). Ảnh được ghi ra thư mục tạm với tên do mình đặt; Typst chạy với --root là thư mục đó,
// không dùng gói ngoài (`@preview`) nên không có truy cập mạng. Xuất file: chạy typst bằng execFile (không qua shell), có giới hạn thời gian.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { splitRow } = require('./office-pptx');
const { checkMarkdown } = require('./office-slides');
const { CONTROL_CHARS, inlineImage } = require('./office-files');

const TYPST_BINARIES = ['/opt/homebrew/bin/typst', '/usr/local/bin/typst'];
const COMPILE_TIMEOUT_MS = 60 * 1000; // một báo cáo vài chục trang biên dịch trong vài giây; quá lâu là treo
const MAX_TABLE_ROWS = 500;
const MAX_TABLE_COLUMNS = 12;
const MAX_IMAGES = 50;
const MAX_CODE_LINES = 2000;
// Mỗi nhánh bắt đầu bằng một ký tự khác nhau và có độ dài tối đa, nên quét tuyến tính trên văn bản bệnh lý.
const INLINE = /\*\*([^*\n]{1,500})\*\*|\*([^*\n]{1,500})\*|(?<!\w)_([^_\n]{1,500})_(?!\w)|`([^`\n]{1,500})`|\[([^\]\n]{1,300})\]\(([^)\n]{1,1000})\)/g;
const IMAGE_LINE = /^!\[([^\]\n]{0,200})\]\(([^)\n]{1,8000000})\)$/;
const IMAGE_EXTENSION = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

function findTypst(exists = fs.existsSync) {
	return TYPST_BINARIES.find(candidate => exists(candidate)) || null;
}

// A Typst string literal. Backslash and quote are the only characters with meaning inside one.
function literal(text) {
	return `"${String(text).replace(CONTROL_CHARS, '').replace(/\t/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function inline(text) {
	let out = '';
	let last = 0;
	INLINE.lastIndex = 0;
	for (let match = INLINE.exec(text); match; match = INLINE.exec(text)) {
		if (match.index > last) out += `#${literal(text.slice(last, match.index))}`;
		if (match[1] !== undefined) out += `#strong[#${literal(match[1])}]`;
		else if (match[2] !== undefined || match[3] !== undefined) out += `#emph[#${literal(match[2] ?? match[3])}]`;
		else if (match[4] !== undefined) out += `#raw(${literal(match[4])})`;
		else out += `#underline[#${literal(match[5])}]#${literal(` (${match[6]})`)}`; // the address is shown, never a live link
		last = match.index + match[0].length;
	}
	if (last < text.length) out += `#${literal(text.slice(last))}`;
	return out;
}

function table(rows) {
	const width = Math.min(MAX_TABLE_COLUMNS, Math.max(...rows.map(row => row.length)));
	const cell = (row, c, bold) => `[${bold ? `#strong[${inline(row[c] ?? '')}]` : inline(row[c] ?? '')}]`;
	const cells = rows.slice(0, MAX_TABLE_ROWS).flatMap((row, r) => Array.from({ length: width }, (_, c) => cell(row, c, r === 0)));
	return `#table(columns: ${width}, inset: 6pt, ${cells.join(', ')})`;
}

function image(alt, ref, assets) {
	const found = /^data:/i.test(ref) ? inlineImage(ref) : null;
	if (!found || assets.length >= MAX_IMAGES) return `#emph[#${literal(`[image not available: ${alt || 'unnamed'}]`)}]`;
	const name = `img${assets.length + 1}.${IMAGE_EXTENSION[found.mime]}`;
	assets.push({ name, data: found.data });
	return `#figure(image(${literal(name)}, width: 70%)${alt ? `, caption: [#${literal(alt)}]` : ''})`;
}

// Markdown to Typst source plus the image files it refers to.
function toTypst(markdown) {
	checkMarkdown(markdown, Number.MAX_SAFE_INTEGER);
	const lines = markdown.replace(/\r\n?/g, '\n').replace(/^---\n(?:[A-Za-z_][\w-]*:.*\n)+---\n/, '').split('\n');
	const assets = [];
	const blocks = [];
	let paragraph = [];
	const flush = () => { if (paragraph.length) blocks.push(inline(paragraph.join(' '))); paragraph = []; };
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (/^```/.test(line)) {
			flush();
			const code = [];
			for (i++; i < lines.length && !/^```/.test(lines[i].trim()) && code.length < MAX_CODE_LINES; i++) code.push(lines[i]);
			blocks.push(`#raw(block: true, ${literal(code.join('\n'))})`);
		} else if (line === '') flush();
		else if (/^(?:---+|\*\*\*+|___+)$/.test(line)) { flush(); blocks.push('#line(length: 100%)'); }
		else if (/^#{1,6}\s/.test(line)) {
			flush();
			const level = /^#+/.exec(line)[0].length;
			blocks.push(`#heading(level: ${level})[${inline(line.replace(/^#+\s+/, ''))}]`);
		} else if (line.startsWith('|')) {
			flush();
			const rows = [];
			for (; i < lines.length && lines[i].trim().startsWith('|'); i++) {
				const cells = splitRow(lines[i].trim());
				if (!cells.every(cell => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
			}
			i--;
			if (rows.length) blocks.push(table(rows));
		} else if (/^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
			flush();
			const ordered = /^\d/.test(line);
			const items = [];
			for (; i < lines.length && /^(?:[-*+]|\d+[.)])\s+/.test(lines[i].trim()); i++) items.push(`[${inline(lines[i].trim().replace(/^(?:[-*+]|\d+[.)])\s+/, ''))}]`);
			i--;
			blocks.push(`#${ordered ? 'enum' : 'list'}(${items.join(', ')})`);
		} else if (IMAGE_LINE.test(line)) {
			flush();
			const [, alt, ref] = IMAGE_LINE.exec(line);
			blocks.push(image(alt, ref.trim(), assets));
		} else paragraph.push(line);
	}
	flush();
	const header = '#set page(paper: "a4", margin: 2cm)\n#set text(size: 11pt)\n#set par(justify: false, leading: 0.7em)\n#set heading(numbering: none)\n';
	return { source: `${header}\n${blocks.join('\n\n')}\n`, assets };
}

function compile({ typst, dir, input, output }) {
	return new Promise((resolve, reject) => {
		execFile(typst, ['compile', '--root', dir, input, output], { timeout: COMPILE_TIMEOUT_MS, env: { PATH: process.env.PATH, HOME: process.env.HOME }, windowsHide: true }, (error, _out, stderr) => {
			if (error) reject(new Error(`Typst failed: ${(stderr || error.message).toString().slice(0, 400)}`));
			else resolve();
		});
	});
}

// `markdown` may already carry images as data URIs (see office-files resolveImages).
async function buildTypstPdf({ markdown, outputFile, typstBinary = findTypst() }) {
	if (!typstBinary) throw new Error('Typst is not installed.');
	const { source, assets } = toTypst(markdown);
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-typst-'));
	try {
		const input = path.join(dir, 'report.typ');
		const output = path.join(dir, 'report.pdf');
		fs.writeFileSync(input, source, 'utf8');
		for (const asset of assets) fs.writeFileSync(path.join(dir, asset.name), asset.data);
		await compile({ typst: typstBinary, dir, input, output });
		fs.copyFileSync(output, outputFile); // only a finished PDF reaches the place the user chose
		return { outputFile, images: assets.length };
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

module.exports = { toTypst, buildTypstPdf, findTypst, literal };

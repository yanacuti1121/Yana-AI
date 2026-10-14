'use strict';
// Đọc file người dùng chọn cho màn Yana Office: văn bản (.md, .txt, .csv) và ảnh nhúng vào slide.
// Không phụ thuộc vscode để test được. Mọi đường dẫn ở đây đã đi qua hộp thoại chọn file của người dùng;
// ảnh chỉ được nhúng khi nằm trong danh sách ImageRegistry (tức là chính người dùng đã chọn), không đọc đường dẫn tùy ý trong Markdown.

const fs = require('node:fs');
const path = require('node:path');

const MAX_TEXT_BYTES = 256 * 1024; // cùng giới hạn với ô slide
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // một ảnh quá lớn làm file xuất phình ra
const MAX_TOTAL_IMAGE_BYTES = 25 * 1024 * 1024; // tổng ảnh nhúng trong một lần xuất
const MAX_CSV_ROWS = 500;
const MAX_CSV_COLUMNS = 20;
const MAX_CELL_CHARS = 200;
const CSV_ROWS_PER_SLIDE = 10; // bảng dài hơn thì không đọc được trên một slide
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.csv']);
const IMAGE_MAGIC = {
	'.png': { mime: 'image/png', test: b => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
	'.jpg': { mime: 'image/jpeg', test: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
	'.gif': { mime: 'image/gif', test: b => b.length > 6 && b.subarray(0, 4).toString('latin1') === 'GIF8' },
	'.webp': { mime: 'image/webp', test: b => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
};
IMAGE_MAGIC['.jpeg'] = IMAGE_MAGIC['.jpg'];
const IMAGE_EXTENSIONS = Object.keys(IMAGE_MAGIC);
const MAX_ALT_CHARS = 200;
const MAX_REFERENCE_CHARS = 1024;
const MAX_INLINE_REFERENCE_CHARS = 8 * 1024 * 1024; // data: URI (the user text itself is capped at 256 KB before this runs)
const MAX_IMAGE_SIDE_PX = 12000; // a small file can declare a huge canvas (decompression bomb) that Chrome then renders
const MAX_IMAGE_PIXELS = 50 * 1000 * 1000;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g; // not valid in XML, so they would corrupt a .pptx
const INLINE_IMAGE = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const MIME_EXTENSION = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };

function regularFile(file, maxBytes, label) {
	let stat;
	try { stat = fs.statSync(file); } catch { throw new Error(`${label} cannot be read.`); }
	if (!stat.isFile()) throw new Error(`${label} is not a regular file.`);
	if (stat.size > maxBytes) throw new Error(`${label} is too large (limit ${Math.round(maxBytes / 1024)} KB).`);
}

// RFC 4180 simplifié: dấu ngoặc kép, dấu phẩy trong ô, xuống dòng trong ô. Tự nhận dấu phân cách `,` `;` hoặc tab ở dòng đầu.
function parseCsv(text) {
	const firstLine = text.split(/\r?\n/, 1)[0] || '';
	const delimiter = [',', ';', '\t'].map(d => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
	const rows = [];
	let row = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
			else if (c === '"') quoted = false;
			else cell += c;
		} else if (c === '"' && cell === '') quoted = true;
		else if (c === delimiter) { row.push(cell); cell = ''; }
		else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(cell); cell = '';
			if (row.some(value => value.trim() !== '')) rows.push(row);
			row = [];
			if (rows.length > MAX_CSV_ROWS + 1) break;
		} else cell += c;
	}
	row.push(cell);
	if (row.some(value => value.trim() !== '')) rows.push(row);
	return rows;
}

function cleanCell(value) {
	return String(value).replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CELL_CHARS).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

// Mỗi slide lặp lại dòng tiêu đề bảng. Mọi dòng bảng bắt đầu bằng `|` nên một ô như `---` không thể thành dấu ngăn slide.
function csvToMarkdown(text, title) {
	const rows = parseCsv(text);
	if (rows.length === 0) throw new Error('The CSV file is empty.');
	const width = Math.min(MAX_CSV_COLUMNS, Math.max(...rows.map(r => r.length)));
	const grid = rows.slice(0, MAX_CSV_ROWS + 1).map(r => Array.from({ length: width }, (_, i) => cleanCell(r[i] ?? '')));
	const [header, ...body] = grid;
	const chunks = [];
	for (let i = 0; i < Math.max(body.length, 1); i += CSV_ROWS_PER_SLIDE) chunks.push(body.slice(i, i + CSV_ROWS_PER_SLIDE));
	const line = cells => `| ${cells.join(' | ')} |`;
	const slides = chunks.map((chunk, index) => {
		const heading = chunks.length > 1 ? `${title} (${index + 1}/${chunks.length})` : title;
		return [`# ${cleanCell(heading)}`, '', line(header), line(header.map(() => '---')), ...chunk.map(line)].join('\n');
	});
	const clipped = rows.length > MAX_CSV_ROWS + 1 || Math.max(...rows.map(r => r.length)) > MAX_CSV_COLUMNS;
	return { markdown: slides.join('\n\n---\n\n') + '\n', rows: body.length, clipped };
}

function readTextFile(file) {
	const extension = path.extname(file).toLowerCase();
	if (!TEXT_EXTENSIONS.has(extension)) throw new Error(`Unsupported file type: ${extension || 'none'}. Open .md, .txt or .csv.`);
	regularFile(file, MAX_TEXT_BYTES, 'The file');
	const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
	if (text.includes('\u0000')) throw new Error('The file looks binary, not text.');
	const name = path.basename(file);
	if (extension === '.csv') {
		const csv = csvToMarkdown(text, path.basename(file, extension));
		return { name, text: csv.markdown, notice: csv.clipped ? `CSV was cut to ${MAX_CSV_ROWS} rows and ${MAX_CSV_COLUMNS} columns.` : '' };
	}
	return { name, text, notice: '' };
}

// Declared canvas size from the header (PNG, GIF, JPEG). WebP is not parsed here; its byte limit still applies.
function declaredSize(data, mime) {
	if (mime === 'image/png' && data.length >= 24) return [data.readUInt32BE(16), data.readUInt32BE(20)];
	if (mime === 'image/gif' && data.length >= 10) return [data.readUInt16LE(6), data.readUInt16LE(8)];
	if (mime === 'image/jpeg') {
		for (let i = 2; i + 9 < data.length;) {
			if (data[i] !== 0xff) { i++; continue; }
			const marker = data[i + 1];
			if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [data.readUInt16BE(i + 7), data.readUInt16BE(i + 5)];
			i += 2 + (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) ? 0 : data.readUInt16BE(i + 2));
		}
	}
	return null;
}

function checkPixels(data, mime) {
	const size = declaredSize(data, mime);
	if (size && (size[0] > MAX_IMAGE_SIDE_PX || size[1] > MAX_IMAGE_SIDE_PX || size[0] * size[1] > MAX_IMAGE_PIXELS)) {
		throw new Error(`The image is too large in pixels (${size[0]} x ${size[1]}).`);
	}
}

function readImage(file) {
	const rule = IMAGE_MAGIC[path.extname(file).toLowerCase()];
	if (!rule) throw new Error('Unsupported image type. Use PNG, JPG, GIF or WebP.');
	regularFile(file, MAX_IMAGE_BYTES, 'The image');
	const data = fs.readFileSync(file);
	if (!rule.test(data)) throw new Error('The file is not a valid image of that type.');
	checkPixels(data, rule.mime);
	return { mime: rule.mime, data };
}

// Only images the user picked in the open dialog can be embedded. The registry is keyed by the exact reference string
// handed back to the webview, so a path found in a document is looked up here and never given to the file system
// (a UNC path such as //host/share/x.png would open a network connection on Windows).
class ImageRegistry {
	constructor() { this.byRef = new Map(); }
	allow(file) {
		const info = readImage(file);
		// encodeURI leaves ( and ) alone, which would end the Markdown reference early.
		const ref = encodeURI(file).replace(/\(/g, '%28').replace(/\)/g, '%29');
		this.byRef.set(ref, fs.realpathSync(file));
		return { ref, alt: path.basename(file, path.extname(file)), mime: info.mime };
	}
	resolve(ref) {
		if (typeof ref !== 'string' || ref.startsWith('//') || ref.includes('\\')) return null;
		const file = this.byRef.get(ref);
		if (!file) return null;
		try { return readImage(file); } catch { return null; } // the picked file may have changed or vanished since
	}
}

// An image already written as a data URI is checked like a file: type, size, and the declared canvas.
function inlineImage(target) {
	const match = INLINE_IMAGE.exec(target);
	if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) return null;
	const data = Buffer.from(match[2], 'base64');
	const rule = IMAGE_MAGIC[MIME_EXTENSION[match[1]]];
	if (data.length > MAX_IMAGE_BYTES || !rule.test(data)) return null;
	try { checkPixels(data, match[1]); } catch { return null; }
	return { mime: match[1], data };
}

// First index of `char` at or after `from`, remembering the last answer. Positions only move forward, so a whole scan
// costs one pass even when the character is missing; a regex here was quadratic on a long run of `![a](`
// (11 s for 256 KB, in the extension host).
function finder(text, char) {
	let cached = text.indexOf(char);
	return from => {
		if (cached !== -1 && cached < from) cached = text.indexOf(char, from);
		return cached;
	};
}

// Calls replacer(whole, alt, ref) for every `![alt](ref)` on one line and returns the rewritten text. Linear in the text.
function replaceImages(markdown, replacer) {
	const closeBracket = finder(markdown, ']');
	const closeParen = finder(markdown, ')');
	const lineBreak = finder(markdown, '\n');
	let result = '';
	let copied = 0;
	let search = 0;
	for (;;) {
		const start = markdown.indexOf('![', search);
		if (start === -1) break;
		const altEnd = closeBracket(start + 2);
		if (altEnd === -1) break;
		const refStart = altEnd + 2;
		const altBreak = lineBreak(start + 2);
		if (altEnd - start - 2 > MAX_ALT_CHARS || (altBreak !== -1 && altBreak < altEnd) || markdown[altEnd + 1] !== '(') { search = start + 2; continue; }
		const refEnd = closeParen(refStart);
		if (refEnd === -1) break;
		const refBreak = lineBreak(refStart);
		const limit = markdown.startsWith('data:', refStart) ? MAX_INLINE_REFERENCE_CHARS : MAX_REFERENCE_CHARS;
		if ((refBreak !== -1 && refBreak < refEnd) || refEnd === refStart || refEnd - refStart > limit) { search = start + 2; continue; }
		result += markdown.slice(copied, start) + replacer(markdown.slice(start, refEnd + 1), markdown.slice(start + 2, altEnd), markdown.slice(refStart, refEnd));
		copied = refEnd + 1;
		search = copied;
	}
	return result + markdown.slice(copied);
}

// Thay ảnh trong Markdown bằng data URI. Ảnh từ mạng bị chặn (luật egress: không để bộ dựng tự tải từ internet).
function resolveImages(markdown, registry) {
	const notes = { embedded: 0, missing: [], blocked: 0 };
	let total = 0;
	const text = replaceImages(markdown, (whole, alt, ref) => {
		const target = ref.trim();
		// Two or more letters before the colon is a URL scheme; one letter is a Windows drive (C:...).
		const isUrl = /^[a-z][a-z0-9+.-]+:/i.test(target) && !/^data:/i.test(target) && !/^file:/i.test(target);
		if (isUrl) { notes.blocked++; return alt ? `*[remote image removed: ${alt}]*` : ''; }
		const image = /^data:/i.test(target) ? inlineImage(target) : registry.resolve(target.replace(/^file:\/\//i, ''));
		if (!image) { notes.missing.push(alt || target); return `*[image not available: ${alt || 'unnamed'}. Insert it again with Insert image.]*`; }
		total += image.data.length;
		if (total > MAX_TOTAL_IMAGE_BYTES) throw new Error(`Embedded images are too large together (limit ${MAX_TOTAL_IMAGE_BYTES / 1024 / 1024} MB).`);
		notes.embedded++;
		return `![${alt}](data:${image.mime};base64,${image.data.toString('base64')})`;
	});
	return { markdown: text, notes };
}

module.exports = {
	readTextFile, readImage, csvToMarkdown, parseCsv, ImageRegistry, resolveImages,
	MAX_TEXT_BYTES, MAX_IMAGE_BYTES, MAX_TOTAL_IMAGE_BYTES, MAX_CSV_ROWS, MAX_CSV_COLUMNS, MAX_IMAGE_SIDE_PX, IMAGE_EXTENSIONS, TEXT_EXTENSIONS,
	CONTROL_CHARS,
};

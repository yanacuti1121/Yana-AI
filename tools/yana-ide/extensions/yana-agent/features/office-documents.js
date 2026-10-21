'use strict';
// Đọc tài liệu văn phòng có sẵn (.docx .pptx .xlsx .odt .odp .ods .pdf .rtf) thành Markdown để dựng slide,
// và ghi Markdown ra Word (.docx) hoặc OpenDocument (.odt). Dùng officeparser; không phụ thuộc vscode để test được.
// OCR luôn tắt (OCR của officeparser tải dữ liệu ngôn ngữ từ mạng) và không trích ảnh khi đọc.

const fs = require('node:fs');
const path = require('node:path');
const { MAX_TEXT_BYTES } = require('./office-files');

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // tài liệu lớn hơn thế không phải thứ để dựng slide
// Trần cho phần giải nén của officeparser (khóa decompressionLimits). Một docx 60 KB với 1,8 triệu phần tử XML từng tốn
// 2,4 GB RAM, vì vậy giới hạn phần tử thấp hơn mặc định.
const DECOMPRESSION_LIMITS = { maxUncompressedBytes: 64 * 1024 * 1024, maxXmlElements: 200000, maxTableCells: 100000 };
const MAX_RAW_OUTPUT_CHARS = 4 * 1024 * 1024; // cắt đầu ra thô trước khi xử lý để các bước sau không chạy trên chuỗi khổng lồ
const CONVERT_TIMEOUT_MS = 60 * 1000; // PDF lớn cần vài giây; quá lâu là treo
const TABLE_ROWS_PER_SLIDE = 10; // khớp với phần nhập CSV
const DOCUMENT_EXTENSIONS = new Set(['.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods', '.pdf', '.rtf']);
const SLIDE_DOCUMENTS = new Set(['.pptx', '.odp']);
const WRITE_FORMATS = { docx: 'docx', odt: 'odt' };

function load(extensionPath) {
	return require(path.join(extensionPath, 'office', 'node_modules', 'officeparser'));
}

function checkSize(file) {
	let stat;
	try { stat = fs.statSync(file); } catch { throw new Error('The document cannot be read.'); }
	if (!stat.isFile()) throw new Error('The document is not a regular file.');
	if (stat.size > MAX_DOCUMENT_BYTES) throw new Error(`The document is too large (limit ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB).`);
}

// officeparser puts a YAML block at the top and tags headings with `{#id}`; both would confuse the slide Markdown.
function tidy(markdown, extension) {
	// Only a real YAML block (lines of `key: value`) is metadata; a leading `---` alone is a slide or sheet separator.
	let text = markdown.replace(/\r\n?/g, '\n').replace(/^---\n(?:[A-Za-z_][\w-]*:.*\n)+---\n/, '');
	// `{0,64}` keeps this linear: an unbounded `[^}\n]*` is quadratic on a long run of ` {#` (inline code is not escaped).
	text = text.replace(/ \{#[^}\n]{0,64}\}$/gm, '').replace(/^<a id="[^"\n]*"><\/a>\n?/gm, '');
	// Slide titles come out as `**Title**` right after a separator; turn them into headings before the first separator is dropped.
	if (SLIDE_DOCUMENTS.has(extension)) text = text.replace(/(^|\n)---\n\n\*\*([^*\n]+)\*\*(?=\n)/g, '$1---\n\n# $2');
	return text.replace(/^(?:---\n+)+/, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// A table longer than one slide is split, repeating the header, so each slide stays readable.
function paginateTables(markdown) {
	const lines = markdown.split('\n');
	const out = [];
	let i = 0;
	while (i < lines.length) {
		if (!lines[i].startsWith('|')) { out.push(lines[i++]); continue; }
		const start = i;
		while (i < lines.length && lines[i].startsWith('|')) i++;
		const block = lines.slice(start, i);
		const [header, divider, ...rows] = block;
		if (rows.length <= TABLE_ROWS_PER_SLIDE || !/^\|[\s:|-]+\|$/.test(divider || '')) { out.push(...block); continue; }
		for (let r = 0; r < rows.length; r += TABLE_ROWS_PER_SLIDE) {
			if (r > 0) out.push('', '---', '');
			out.push(header, divider, ...rows.slice(r, r + TABLE_ROWS_PER_SLIDE));
		}
	}
	return out.join('\n');
}

function clip(text) {
	if (Buffer.byteLength(text, 'utf8') <= MAX_TEXT_BYTES) return { text, clipped: false };
	let cut = text.slice(0, MAX_TEXT_BYTES);
	cut = cut.slice(0, Math.max(cut.lastIndexOf('\n'), 0)) + '\n';
	while (Buffer.byteLength(cut, 'utf8') > MAX_TEXT_BYTES) cut = cut.slice(0, cut.lastIndexOf('\n', cut.length - 2) + 1);
	return { text: cut, clipped: true };
}

async function withTimeout(run, timeoutMs = CONVERT_TIMEOUT_MS) {
	const controller = new AbortController();
	// A limit of 0 or less means "already over": the signal is aborted before the work starts (used by tests).
	if (timeoutMs <= 0) controller.abort();
	const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs, 1));
	try { return await run(controller.signal); } finally { clearTimeout(timer); }
}

async function readDocument(extensionPath, file, { timeoutMs = CONVERT_TIMEOUT_MS } = {}) {
	const extension = path.extname(file).toLowerCase();
	if (!DOCUMENT_EXTENSIONS.has(extension)) throw new Error(`Unsupported document type: ${extension || 'none'}.`);
	checkSize(file);
	const { OfficeConverter } = load(extensionPath);
	const warnings = [];
	const result = await withTimeout(signal => OfficeConverter.convert(file, 'md', {
		// `abortSignal` is the real key; `signal` is ignored by officeparser (it only warns), which left this timeout doing nothing.
		parseConfig: { ocr: false, extractAttachments: false, ignoreNotes: true, abortSignal: signal, decompressionLimits: DECOMPRESSION_LIMITS },
		onWarning: issue => warnings.push(issue.code),
	}), timeoutMs).catch(error => { throw new Error(`Could not read the document: ${String(error.message).slice(0, 200)}`); });
	const markdown = tidy(String(result.value || '').slice(0, MAX_RAW_OUTPUT_CHARS), extension);
	if (markdown.trim() === '') throw new Error('No readable text was found in the document.');
	const { text, clipped } = clip(paginateTables(markdown));
	return { name: path.basename(file), text, notice: clipped ? 'The document was cut to fit the 256 KB slide text limit.' : '' };
}

// Markdown (with images already embedded as data URIs) to Word or OpenDocument bytes.
async function renderDocument(extensionPath, markdown, format) {
	const target = WRITE_FORMATS[format];
	if (!target) throw new Error(`Unsupported document format: ${format}`);
	const { OfficeConverter } = load(extensionPath);
	const result = await withTimeout(signal => OfficeConverter.convert(Buffer.from(markdown, 'utf8'), target, {
		parseConfig: { fileType: 'md', extractAttachments: true, ocr: false, abortSignal: signal, decompressionLimits: DECOMPRESSION_LIMITS },
	})).catch(error => { throw new Error(`Could not create the document: ${String(error.message).slice(0, 200)}`); });
	return Buffer.from(result.value);
}

module.exports = { readDocument, renderDocument, tidy, paginateTables, withTimeout, DOCUMENT_EXTENSIONS, WRITE_FORMATS, MAX_DOCUMENT_BYTES, CONVERT_TIMEOUT_MS };

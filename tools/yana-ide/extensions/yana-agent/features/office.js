'use strict';
// Công cụ văn phòng (slide, PDF, PowerPoint) mở thành một tab trong IDE. Khung này chỉ báo công cụ nào đã có trên máy;
// việc tạo hay ghi file thật sẽ đi qua cổng duyệt của Yana và chỉ được thêm khi công cụ tương ứng đã được cài.

const vscode = require('vscode');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const slides = require('./office-slides');
const pptx = require('./office-pptx');
const files = require('./office-files');
const documents = require('./office-documents');
const xlsx = require('./office-xlsx');
const typst = require('./office-typst');

const MAX_EMBEDDED_MARKDOWN_BYTES = 40 * 1024 * 1024; // the user's text (256 KB) plus up to 25 MB of images as base64

const VIEW_TYPE = 'yana.office';

// Danh sách công cụ cần có. `check` là đường dẫn tương đối tính từ thư mục tiện ích (npm) hoặc đường dẫn tuyệt đối (brew).
// Chỉ kiểm tra file có tồn tại, không chạy công cụ nào.
const TOOLS = [
	{ id: 'marp', label: 'Slides from Markdown (Marp)', purpose: 'Preview slides, export PDF and PPTX', check: 'office/node_modules/@marp-team/marp-cli/package.json' },
	{ id: 'typst', label: 'Documents and reports (Typst)', purpose: 'Typeset reports and export PDF', check: '/opt/homebrew/bin/typst' },
	{ id: 'pptx', label: 'PowerPoint files (PptxGenJS)', purpose: 'Build editable .pptx files', check: 'office/node_modules/pptxgenjs/package.json' },
	{ id: 'documents', label: 'Office documents (officeparser)', purpose: 'Open .docx .pptx .xlsx .odt .pdf as Markdown; export Word and OpenDocument', check: 'office/node_modules/officeparser/package.json' },
];

function toolStatus(extensionPath, exists = fs.existsSync) {
	return TOOLS.map(tool => {
		const target = path.isAbsolute(tool.check) ? tool.check : path.join(extensionPath, tool.check);
		const available = Boolean(exists(target));
		return { id: tool.id, label: tool.label, purpose: tool.purpose, available, note: available ? 'Installed' : 'Not available yet' };
	});
}

function html(webview, media) {
	const nonce = crypto.randomBytes(16).toString('base64');
	const uri = name => webview.asWebviewUri(vscode.Uri.joinPath(media, name));
	// style-src 'unsafe-inline' và frame-src about: chỉ để khung xem trước slide (iframe srcdoc sandbox="", không chạy script, không mạng).
	const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src data:; frame-src about:; script-src 'nonce-${nonce}';`;
	return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('office.css')}"><title>Yana Office</title></head>
<body><div id="app"><p>Loading…</p></div><script nonce="${nonce}" src="${uri('office.js')}"></script></body></html>`;
}

let panel;
// Images the user picked in this panel. Markdown can only embed these; a path typed by hand is never read.
let images = new files.ImageRegistry();
let pendingInitialMarkdown;

const SAVE_FILTERS = {
	pdf: { PDF: ['pdf'] },
	pptx: { PowerPoint: ['pptx'] },
	'pptx-edit': { PowerPoint: ['pptx'] },
	html: { HTML: ['html'] },
	md: { Markdown: ['md'] },
	docx: { Word: ['docx'] },
	odt: { 'OpenDocument Text': ['odt'] },
	xlsx: { Excel: ['xlsx'] },
	typst: { PDF: ['pdf'] },
};

function reply(message) {
	panel?.webview.postMessage(message);
}

function describeNotes(notes) {
	const parts = [];
	if (notes.missing.length) parts.push(`${notes.missing.length} image(s) not available, insert them again`);
	if (notes.blocked) parts.push(`${notes.blocked} web image(s) removed (no downloads)`);
	return parts.join('; ');
}

// Opening a file or an image is the user's own choice in the open dialog; nothing else is ever read.
async function openTextFile(context) {
	const filters = {
		'All supported': [...files.TEXT_EXTENSIONS, ...documents.DOCUMENT_EXTENSIONS].map(extension => extension.slice(1)),
		'Text and tables': ['md', 'markdown', 'txt', 'csv'],
		'Office documents': [...documents.DOCUMENT_EXTENSIONS].map(extension => extension.slice(1)),
	};
	const picked = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Open', filters });
	if (!picked?.length) return { type: 'opened', cancelled: true };
	const file = picked[0].fsPath;
	if (documents.DOCUMENT_EXTENSIONS.has(path.extname(file).toLowerCase())) return { type: 'opened', ...await documents.readDocument(context.extensionPath, file) };
	return { type: 'opened', ...files.readTextFile(file) };
}

async function pickImage() {
	const picked = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Insert image', filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'] } });
	if (!picked?.length) return { type: 'image', cancelled: true };
	return { type: 'image', ...images.allow(picked[0].fsPath) };
}

async function exportFile(context, message) {
	// hasOwn: "constructor" or "__proto__" are not formats but would pass a plain lookup.
	if (!Object.hasOwn(SAVE_FILTERS, message.format)) throw new Error('Unsupported export format.');
	const filters = SAVE_FILTERS[message.format];
	slides.checkMarkdown(message.markdown);
	const target = await vscode.window.showSaveDialog({ filters, saveLabel: `Export ${message.format.toUpperCase()}` });
	if (!target) return { type: 'exported', cancelled: true };
	reply({ type: 'busy' });
	if (message.format === 'md') {
		fs.writeFileSync(target.fsPath, message.markdown, 'utf8');
		return { type: 'exported', path: target.fsPath };
	}
	if (message.format === 'xlsx') {
		const built = await xlsx.buildXlsx({ extensionPath: context.extensionPath, markdown: message.markdown });
		fs.writeFileSync(target.fsPath, built.bytes);
		return { type: 'exported', path: target.fsPath, note: `${built.sheets.length} sheet(s)` };
	}
	if (message.format === 'typst') {
		const embedded = files.resolveImages(message.markdown, images);
		await typst.buildTypstPdf({ markdown: embedded.markdown, outputFile: target.fsPath });
		return { type: 'exported', path: target.fsPath, note: describeNotes(embedded.notes) };
	}
	if (message.format === 'docx' || message.format === 'odt') {
		const embedded = files.resolveImages(message.markdown, images);
		fs.writeFileSync(target.fsPath, await documents.renderDocument(context.extensionPath, embedded.markdown, message.format));
		return { type: 'exported', path: target.fsPath, note: describeNotes(embedded.notes) };
	}
	if (message.format === 'pptx-edit') {
		const built = await pptx.buildPptx({ extensionPath: context.extensionPath, markdown: message.markdown, outputFile: target.fsPath, resolveImage: ref => images.resolve(ref.replace(/^file:\/\//i, '')) });
		return { type: 'exported', path: target.fsPath, note: built.skippedImages ? `${built.skippedImages} image(s) skipped (not picked with Insert image, or more than 2 on a slide)` : '' };
	}
	const embedded = files.resolveImages(message.markdown, images);
	await slides.exportSlides({ extensionPath: context.extensionPath, markdown: embedded.markdown, format: message.format, outputFile: target.fsPath, limit: MAX_EMBEDDED_MARKDOWN_BYTES });
	return { type: 'exported', path: target.fsPath, note: describeNotes(embedded.notes) };
}

// The preview is built in memory only. A file is written only after the user chose where to save it in the save dialog,
// and that dialog is the approval step.
async function handleMessage(context, message) {
	try {
		if (message?.type === 'ready') {
			reply({ type: 'status', tools: toolStatus(context.extensionPath) });
			if (pendingInitialMarkdown) {
				reply({ type: 'load-markdown', text: pendingInitialMarkdown });
				pendingInitialMarkdown = undefined;
			}
		}
		else if (message?.type === 'open') reply(await openTextFile(context));
		else if (message?.type === 'insert-image') reply(await pickImage());
		else if (message?.type === 'preview') {
			slides.checkMarkdown(message.markdown);
			const embedded = files.resolveImages(message.markdown, images);
			reply({ type: 'preview', ...slides.renderPreview(context.extensionPath, embedded.markdown, MAX_EMBEDDED_MARKDOWN_BYTES), note: describeNotes(embedded.notes) });
		} else if (message?.type === 'export') reply(await exportFile(context, message));
	} catch (error) {
		reply({ type: 'error', message: error.message });
	}
}

function open(context, initialMarkdown) {
	if (panel) {
		panel.reveal();
		if (initialMarkdown) panel.webview.postMessage({ type: 'load-markdown', text: initialMarkdown });
		return;
	}
	if (initialMarkdown) pendingInitialMarkdown = initialMarkdown;
	const media = vscode.Uri.joinPath(context.extensionUri, 'media');
	panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'Yana Office', vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [media] });
	panel.iconPath = vscode.Uri.joinPath(media, 'yana.svg');
	panel.webview.html = html(panel.webview, media);
	panel.webview.onDidReceiveMessage(message => handleMessage(context, message));
	panel.onDidDispose(() => { panel = undefined; images = new files.ImageRegistry(); pendingInitialMarkdown = undefined; });
}

function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('yana.office.open', initialMarkdown => open(context, initialMarkdown)));
	if (process.env.YANA_OPEN_OFFICE) open(context);
}

module.exports = { id: 'office', activate, toolStatus, TOOLS };

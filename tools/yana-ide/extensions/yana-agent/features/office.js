'use strict';
// Công cụ văn phòng (slide, PDF, PowerPoint) mở thành một tab trong IDE. Khung này chỉ báo công cụ nào đã có trên máy;
// việc tạo hay ghi file thật sẽ đi qua cổng duyệt của Yana và chỉ được thêm khi công cụ tương ứng đã được cài.

const vscode = require('vscode');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const slides = require('./office-slides');
const pptx = require('./office-pptx');

const VIEW_TYPE = 'yana.office';

// Danh sách công cụ cần có. `check` là đường dẫn tương đối tính từ thư mục tiện ích (npm) hoặc đường dẫn tuyệt đối (brew).
// Chỉ kiểm tra file có tồn tại, không chạy công cụ nào.
const TOOLS = [
	{ id: 'marp', label: 'Slides from Markdown (Marp)', purpose: 'Preview slides, export PDF and PPTX', check: 'office/node_modules/@marp-team/marp-cli/package.json' },
	{ id: 'typst', label: 'Documents and reports (Typst)', purpose: 'Typeset reports and export PDF', check: '/opt/homebrew/bin/typst' },
	{ id: 'pptx', label: 'PowerPoint files (PptxGenJS)', purpose: 'Build editable .pptx files', check: 'office/node_modules/pptxgenjs/package.json' },
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

const SAVE_FILTERS = { pdf: { PDF: ['pdf'] }, pptx: { PowerPoint: ['pptx'] }, 'pptx-edit': { PowerPoint: ['pptx'] } };

function reply(message) {
	panel?.webview.postMessage(message);
}

// Xem trước chỉ dựng trong bộ nhớ. Xuất file chỉ chạy sau khi người dùng chọn nơi lưu trong hộp thoại lưu (đó là bước duyệt).
async function handleMessage(context, message) {
	if (message?.type === 'ready') {
		reply({ type: 'status', tools: toolStatus(context.extensionPath) });
		return;
	}
	if (message?.type === 'preview') {
		try {
			reply({ type: 'preview', ...slides.renderPreview(context.extensionPath, message.markdown) });
		} catch (error) {
			reply({ type: 'error', message: error.message });
		}
		return;
	}
	if (message?.type === 'export') {
		const filters = SAVE_FILTERS[message.format];
		if (!filters) {
			reply({ type: 'error', message: 'Unsupported export format.' });
			return;
		}
		try {
			slides.checkMarkdown(message.markdown);
			const target = await vscode.window.showSaveDialog({ filters, saveLabel: `Export ${message.format.toUpperCase()}` });
			if (!target) {
				reply({ type: 'exported', cancelled: true });
				return;
			}
			reply({ type: 'busy' });
			if (message.format === 'pptx-edit') await pptx.buildPptx({ extensionPath: context.extensionPath, markdown: message.markdown, outputFile: target.fsPath });
			else await slides.exportSlides({ extensionPath: context.extensionPath, markdown: message.markdown, format: message.format, outputFile: target.fsPath });
			reply({ type: 'exported', path: target.fsPath });
		} catch (error) {
			reply({ type: 'error', message: error.message });
		}
	}
}

function open(context) {
	if (panel) {
		panel.reveal();
		return;
	}
	const media = vscode.Uri.joinPath(context.extensionUri, 'media');
	panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'Yana Office', vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [media] });
	panel.iconPath = vscode.Uri.joinPath(media, 'yana.svg');
	panel.webview.html = html(panel.webview, media);
	panel.webview.onDidReceiveMessage(message => handleMessage(context, message));
	panel.onDidDispose(() => { panel = undefined; });
}

function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('yana.office.open', () => open(context)));
}

module.exports = { id: 'office', activate, toolStatus, TOOLS };

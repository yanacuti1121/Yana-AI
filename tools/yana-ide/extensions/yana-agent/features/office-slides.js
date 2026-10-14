'use strict';
// Slide từ Markdown bằng Marp. Không phụ thuộc vscode để test được bằng Marp thật.
// Xem trước: dựng bằng marp-core với html:false (thẻ HTML trong Markdown bị escape) và script:false.
// Xuất file: chạy marp-cli bằng execFile (không qua shell), đường dẫn truyền như tham số riêng, có giới hạn thời gian.

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');

const MAX_MARKDOWN_BYTES = 256 * 1024; // đủ cho hàng trăm slide chữ; chặn đầu vào lớn làm treo bộ dựng
const EXPORT_TIMEOUT_MS = 90 * 1000; // Chrome cần vài giây để dựng PDF; quá lâu là treo
const EXPORT_FORMATS = { pdf: '--pdf', pptx: '--pptx', html: '--html' };

function officeDir(extensionPath) {
	return path.join(extensionPath, 'office');
}

function checkMarkdown(markdown) {
	if (typeof markdown !== 'string' || markdown.trim() === '') throw new Error('The slide text is empty.');
	if (Buffer.byteLength(markdown, 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('The slide text is too large (limit 256 KB).');
}

function renderPreview(extensionPath, markdown) {
	checkMarkdown(markdown);
	const { Marp } = require(path.join(officeDir(extensionPath), 'node_modules', '@marp-team', 'marp-core'));
	const marp = new Marp({ html: false, script: false });
	const { html, css } = marp.render(markdown);
	return { html, css };
}

// Dựng danh sách đối số cho marp-cli. Không có nối chuỗi thành lệnh shell.
function exportArgs(extensionPath, inputFile, outputFile, format) {
	const flag = EXPORT_FORMATS[format];
	if (!flag) throw new Error(`Unsupported export format: ${format}`);
	const cli = path.join(officeDir(extensionPath), 'node_modules', '@marp-team', 'marp-cli', 'marp-cli.js');
	return [cli, inputFile, flag, '--no-config', '--no-stdin', '--output', outputFile]; // --no-stdin: không thì marp-cli chờ stdin và treo
}

function exportSlides({ extensionPath, markdown, format, outputFile, nodeBinary = process.execPath, env = process.env }) {
	checkMarkdown(markdown);
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-slides-'));
	const input = path.join(dir, 'slides.md');
	fs.writeFileSync(input, markdown, 'utf8');
	const args = exportArgs(extensionPath, input, outputFile, format);
	return new Promise((resolve, reject) => {
		execFile(nodeBinary, args, { timeout: EXPORT_TIMEOUT_MS, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true }, (error, _out, stderr) => {
			fs.rmSync(dir, { recursive: true, force: true });
			if (error) reject(new Error(`Export failed: ${(stderr || error.message).toString().slice(0, 400)}`));
			else resolve(outputFile);
		});
	});
}

module.exports = { renderPreview, exportArgs, exportSlides, checkMarkdown, MAX_MARKDOWN_BYTES, EXPORT_FORMATS };

'use strict';
// Sinh màn hình cho Design Canvas: dựng prompt thiết kế, chạy yana-rt trong một thư mục rỗng cách ly
// (như app Studio cũ làm với canvas-ai-sandbox) để model không đọc hay sửa được dự án, rồi tách HTML
// ra khỏi phần chữ model trả về. Không phụ thuộc vscode, để kiểm thử được bằng node thuần.

const fs = require('node:fs');
const path = require('node:path');

const MAX_INSTRUCTION = 4000; // ký tự mô tả mỗi lần gửi
const MAX_HTML = 200 * 1024; // một màn hình tối đa 200 KB HTML
const COCKPIT = { surface: '#12151c', panel: '#161a22', border: '#252a36', foreground: '#e2e2e8', muted: '#94a3b8', accent: '#4f80ff' };

const DESIGN_RULES = [
	'You are the design engine inside Yana Studio. You produce one complete screen as HTML.',
	'Output exactly one ```html code block containing a full document (<!DOCTYPE html> ... </html>). No other text before or after it.',
	'Put all CSS in one <style> tag inside <head>. No <script>, no inline event handlers, no external fonts, images, stylesheets or links of any kind: the preview has no network and runs no scripts.',
	'Use system fonts. Use inline SVG for icons. Use real, readable text; minimum font size 12px.',
	'Never invent metrics, counts, prices or user data. Where real data would appear, use clearly generic placeholders such as "Project name" or "—".',
	'Make it responsive and accessible: semantic elements, labels on inputs, visible focus styles, contrast at least 4.5:1 for text.',
	'Do not use tools, read files or run commands.',
].join('\n');

function palette(tokens) {
	const pick = (key, fallback) => tokens?.[key]?.value || fallback;
	return {
		surface: pick('surface', COCKPIT.surface),
		foreground: pick('foreground', COCKPIT.foreground),
		accent: pick('accent', COCKPIT.accent),
		panel: COCKPIT.panel,
		border: COCKPIT.border,
		muted: COCKPIT.muted,
	};
}

function systemPrompt(tokens) {
	const colors = palette(tokens);
	const list = Object.entries(colors).map(([name, value]) => `${name} ${value}`).join(', ');
	return `${DESIGN_RULES}\nDesign palette (use these colors): ${list}.`;
}

// mode: 'new' (màn mới), 'variant' (phương án khác cho cùng mô tả), 'refine' (sửa màn hiện tại).
function buildTask({ mode, instruction, device, currentHtml }) {
	const text = String(instruction || '').trim();
	if (!text) throw new Error('Describe the screen first');
	if (text.length > MAX_INSTRUCTION) throw new Error(`Keep the description under ${MAX_INSTRUCTION} characters`);
	const target = device === 'phone' ? 'a phone screen (390px wide)' : 'a desktop screen (1280px wide)';
	if (mode === 'refine') {
		if (!currentHtml) throw new Error('Pick a screen to refine');
		return `Revise this ${target}. Keep everything the request does not mention.\nRequest: ${text}\nCurrent HTML:\n${currentHtml.slice(0, MAX_HTML)}`;
	}
	const variant = mode === 'variant' ? '\nThis is an alternative take: choose a clearly different layout from the obvious one.' : '';
	return `Design ${target}.\nRequest: ${text}${variant}`;
}

// Lấy HTML từ phần chữ (kể cả khi đang stream và khối code chưa đóng). Trả '' nếu chưa có gì dùng được.
function extractHtml(output) {
	const source = String(output || '');
	const fence = /```html\s*\n([\s\S]*?)(```|$)/i.exec(source);
	let html = fence ? fence[1] : '';
	if (!html) {
		const start = source.search(/<!doctype html|<html[\s>]/i);
		html = start >= 0 ? source.slice(start) : '';
	}
	return html.trim().slice(0, MAX_HTML);
}

// Thư mục rỗng riêng cho yana-rt khi thiết kế; tạo lại nếu đã bị xoá.
function sandboxDir(storageRoot) {
	const dir = path.join(storageRoot, 'canvas-sandbox');
	fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	return dir;
}

module.exports = { systemPrompt, buildTask, extractHtml, sandboxDir, MAX_HTML };

'use strict';
// File PowerPoint sửa được (.pptx) bằng PptxGenJS, dựng từ cùng Markdown với phần Marp.
// Quy ước: một dòng chỉ có `---` ngăn slide; dòng `#`/`##` đầu tiên của slide là tiêu đề; dòng `- ` là gạch đầu dòng;
// các dòng khác là đoạn chữ. Khối front matter ở đầu (giữa hai dòng `---`) bị bỏ qua.
// Không phụ thuộc vscode để test được bằng PptxGenJS thật. Ghi file ở nơi người dùng đã chọn trong hộp thoại lưu.

const path = require('node:path');
const { checkMarkdown } = require('./office-slides');

const MAX_SLIDES = 200; // chặn bản Markdown khổng lồ sinh file PowerPoint vô nghĩa
const MAX_LINE_CHARS = 2000; // một dòng dài hơn thế không phải slide, là dữ liệu dán nhầm
const TITLE_COLOR = '1F2937'; // màu chữ tài liệu, không phải giao diện IDE
const BODY_COLOR = '374151';
const TITLE_SIZE_PT = 32;
const BODY_SIZE_PT = 20;

function stripFrontMatter(lines) {
	if (lines[0]?.trim() !== '---') return lines;
	const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
	return end === -1 ? lines : lines.slice(end + 1);
}

function parseDeck(markdown) {
	checkMarkdown(markdown);
	const lines = stripFrontMatter(markdown.replace(/\r\n?/g, '\n').split('\n'));
	const chunks = [[]];
	for (const line of lines) {
		if (line.trim() === '---') chunks.push([]);
		else chunks[chunks.length - 1].push(line.slice(0, MAX_LINE_CHARS));
	}
	const slides = [];
	for (const chunk of chunks) {
		const slide = { title: '', bullets: [], paragraphs: [] };
		for (const raw of chunk) {
			const line = raw.trim();
			if (!line) continue;
			const heading = /^#{1,6}\s+(.*)$/.exec(line);
			const bullet = /^[-*+]\s+(.*)$/.exec(line);
			if (heading && !slide.title) slide.title = heading[1];
			else if (bullet) slide.bullets.push(bullet[1]);
			else slide.paragraphs.push(heading ? heading[1] : line);
		}
		if (slide.title || slide.bullets.length || slide.paragraphs.length) slides.push(slide);
	}
	if (slides.length === 0) throw new Error('No slide content found.');
	if (slides.length > MAX_SLIDES) throw new Error(`Too many slides (limit ${MAX_SLIDES}).`);
	return slides;
}

async function buildPptx({ extensionPath, markdown, outputFile }) {
	const slides = parseDeck(markdown);
	const PptxGenJS = require(path.join(extensionPath, 'office', 'node_modules', 'pptxgenjs'));
	const deck = new PptxGenJS();
	deck.layout = 'LAYOUT_16x9';
	for (const item of slides) {
		const slide = deck.addSlide();
		if (item.title) slide.addText(item.title, { x: 0.6, y: 0.4, w: 8.8, h: 1, fontSize: TITLE_SIZE_PT, bold: true, color: TITLE_COLOR });
		const body = [
			...item.paragraphs.map(text => ({ text, options: { breakLine: true } })),
			...item.bullets.map(text => ({ text, options: { bullet: true, breakLine: true } })),
		];
		if (body.length) slide.addText(body, { x: 0.6, y: 1.6, w: 8.8, h: 3.6, fontSize: BODY_SIZE_PT, color: BODY_COLOR, valign: 'top' });
	}
	await deck.writeFile({ fileName: outputFile });
	return { outputFile, slides: slides.length };
}

module.exports = { parseDeck, buildPptx, MAX_SLIDES };

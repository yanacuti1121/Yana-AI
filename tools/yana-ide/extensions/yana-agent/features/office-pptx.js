'use strict';
// File PowerPoint sửa được (.pptx) bằng PptxGenJS, dựng từ cùng Markdown với phần Marp.
// Quy ước: một dòng chỉ có `---` ngăn slide; dòng `#`/`##` đầu tiên của slide là tiêu đề; dòng `- ` là gạch đầu dòng;
// các dòng khác là đoạn chữ. Khối front matter ở đầu (giữa hai dòng `---`) bị bỏ qua.
// Không phụ thuộc vscode để test được bằng PptxGenJS thật. Ghi file ở nơi người dùng đã chọn trong hộp thoại lưu.

const path = require('node:path');
const { checkMarkdown } = require('./office-slides');
const { CONTROL_CHARS, MAX_TOTAL_IMAGE_BYTES } = require('./office-files');

const MAX_IMAGES_PER_SLIDE = 2; // the layout has room for two pictures beside the text

const MAX_SLIDES = 200; // chặn bản Markdown khổng lồ sinh file PowerPoint vô nghĩa
const MAX_LINE_CHARS = 2000; // một dòng dài hơn thế không phải slide, là dữ liệu dán nhầm
const TITLE_COLOR = '1F2937'; // màu chữ tài liệu, không phải giao diện IDE
const BODY_COLOR = '374151';
const TITLE_SIZE_PT = 32;
const BODY_SIZE_PT = 20;
const TABLE_SIZE_PT = 14;
const MAX_TABLE_ROWS = 30; // a longer table does not fit one slide
const MAX_TABLE_COLUMNS = 12;
const TABLE_BORDER_COLOR = 'D1D5DB';

// Split a table row on `|` that is not escaped (`\|` is a literal pipe, `\\` a backslash).
function splitRow(line) {
	const cells = [];
	let cell = '';
	const body = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
	for (let i = 0; i < body.length; i++) {
		if (body[i] === '\\' && (body[i + 1] === '|' || body[i + 1] === '\\')) { cell += body[i + 1]; i++; }
		else if (body[i] === '|') { cells.push(cell.trim()); cell = ''; }
		else cell += body[i];
	}
	cells.push(cell.trim());
	return cells;
}

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
		else chunks[chunks.length - 1].push(line.slice(0, MAX_LINE_CHARS).replace(CONTROL_CHARS, '')); // control characters are not valid XML: PowerPoint would ask to repair the file
	}
	const slides = [];
	for (const chunk of chunks) {
		const slide = { title: '', bullets: [], paragraphs: [], table: [], images: [] };
		for (const raw of chunk) {
			const line = raw.trim();
			if (!line) continue;
			const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
			if (image) { slide.images.push({ alt: image[1], ref: image[2].trim() }); continue; }
			if (line.startsWith('|')) {
				const cells = splitRow(line);
				const isSeparator = cells.every(cell => /^:?-{2,}:?$/.test(cell));
				if (!isSeparator && slide.table.length < MAX_TABLE_ROWS) slide.table.push(cells.slice(0, MAX_TABLE_COLUMNS));
				continue;
			}
			const heading = /^#{1,6}\s+(.*)$/.exec(line);
			const bullet = /^[-*+]\s+(.*)$/.exec(line);
			if (heading && !slide.title) slide.title = heading[1];
			else if (bullet) slide.bullets.push(bullet[1]);
			else slide.paragraphs.push(heading ? heading[1] : line);
		}
		if (slide.title || slide.bullets.length || slide.paragraphs.length || slide.table.length || slide.images.length) slides.push(slide);
	}
	if (slides.length === 0) throw new Error('No slide content found.');
	if (slides.length > MAX_SLIDES) throw new Error(`Too many slides (limit ${MAX_SLIDES}).`);
	return slides;
}

// `resolveImage(ref)` returns { mime, data } for an image the user picked, or null. Anything else is skipped.
async function buildPptx({ extensionPath, markdown, outputFile, resolveImage = () => null }) {
	const slides = parseDeck(markdown);
	const PptxGenJS = require(path.join(extensionPath, 'office', 'node_modules', 'pptxgenjs'));
	const deck = new PptxGenJS();
	deck.layout = 'LAYOUT_16x9';
	const imageCache = new Map(); // one disk read per picture, however many slides reuse it
	let embeddedBytes = 0;
	let skippedImages = 0;
	for (const item of slides) {
		const slide = deck.addSlide();
		if (item.title) slide.addText(item.title, { x: 0.6, y: 0.4, w: 8.8, h: 1, fontSize: TITLE_SIZE_PT, bold: true, color: TITLE_COLOR });
		const body = [
			...item.paragraphs.map(text => ({ text, options: { breakLine: true } })),
			...item.bullets.map(text => ({ text, options: { bullet: true, breakLine: true } })),
		];
		const pictures = [];
		for (const picture of item.images) {
			if (pictures.length >= MAX_IMAGES_PER_SLIDE) { skippedImages++; continue; }
			if (!imageCache.has(picture.ref)) imageCache.set(picture.ref, resolveImage(picture.ref));
			const image = imageCache.get(picture.ref);
			if (!image) { skippedImages++; continue; }
			embeddedBytes += image.data.length;
			if (embeddedBytes > MAX_TOTAL_IMAGE_BYTES) throw new Error(`Embedded images are too large together (limit ${MAX_TOTAL_IMAGE_BYTES / 1024 / 1024} MB).`);
			pictures.push({ picture, image });
		}
		const textWidth = pictures.length ? 5.2 : 8.8;
		if (body.length) slide.addText(body, { x: 0.6, y: 1.6, w: textWidth, h: 3.6, fontSize: BODY_SIZE_PT, color: BODY_COLOR, valign: 'top' });
		if (item.table.length) {
			const rows = item.table.map((cells, index) => cells.map(text => ({ text, options: { bold: index === 0, fontSize: TABLE_SIZE_PT, color: BODY_COLOR } })));
			slide.addTable(rows, { x: 0.6, y: body.length ? 3.6 : 1.6, w: 8.8, border: { type: 'solid', color: TABLE_BORDER_COLOR, pt: 1 } });
		}
		pictures.forEach(({ picture, image }, index) => {
			const frame = { x: 6.0, y: 1.6 + index * 1.9, w: 3.6, h: pictures.length > 1 ? 1.8 : 3.6 };
			slide.addImage({ data: `${image.mime};base64,${image.data.toString('base64')}`, altText: picture.alt, ...frame, sizing: { type: 'contain', w: frame.w, h: frame.h } });
		});
	}
	await deck.writeFile({ fileName: outputFile });
	return { outputFile, slides: slides.length, skippedImages };
}

module.exports = { parseDeck, buildPptx, splitRow, MAX_SLIDES };

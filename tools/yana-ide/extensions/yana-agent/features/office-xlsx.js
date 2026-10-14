'use strict';
// Excel (.xlsx) từ các bảng Markdown, viết tay bằng jszip (không dùng thư viện Excel nào). Mỗi bảng là một sheet.
// Ô luôn ghi là chuỗi trừ khi trông đúng là một số, nên ô bắt đầu bằng `=`, `+`, `-`, `@` không bao giờ thành công thức.
// Không phụ thuộc vscode để test được.

const path = require('node:path');
const { splitRow } = require('./office-pptx');

const MAX_SHEETS = 20;
const MAX_ROWS = 1000;
const MAX_COLUMNS = 50;
const MAX_CELL_CHARS = 2000;
const MAX_SHEET_NAME = 31; // giới hạn của Excel
// A number only when it round-trips: `007` (an id, a zip code) stays text instead of silently becoming 7.
const NUMBER = /^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,15})?$/;
const RESERVED_SHEET_NAME = 'history'; // Excel refuses it
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

function escapeXml(text) {
	return String(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function columnName(index) {
	let name = '';
	for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
	return name;
}

// Tables are runs of lines starting with `|`; the divider row is dropped; the nearest heading above names the sheet.
function extractTables(markdown) {
	const tables = [];
	let heading = '';
	let current = null;
	for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
		const line = raw.trim();
		if (line.startsWith('|')) {
			if (!current) { current = { name: heading, rows: [] }; tables.push(current); }
			const cells = splitRow(line);
			if (!cells.every(cell => /^:?-{2,}:?$/.test(cell)) && current.rows.length < MAX_ROWS) current.rows.push(cells.slice(0, MAX_COLUMNS).map(cell => cell.slice(0, MAX_CELL_CHARS)));
			continue;
		}
		current = null;
		const title = /^#{1,6}\s+(.*)$/.exec(line);
		if (title) heading = title[1];
	}
	return tables.filter(table => table.rows.length).slice(0, MAX_SHEETS);
}

function sheetNames(tables) {
	const used = new Set();
	return tables.map((table, index) => {
		// Excel also refuses a name that starts or ends with an apostrophe.
		let base = (table.name || `Table ${index + 1}`).replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').trim().slice(0, MAX_SHEET_NAME) || `Table ${index + 1}`;
		if (base.toLowerCase() === RESERVED_SHEET_NAME) base = `${base} 1`;
		let name = base;
		for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, MAX_SHEET_NAME - 3)} ${n}`;
		used.add(name.toLowerCase());
		return name;
	});
}

function sheetXml(rows) {
	const body = rows.map((cells, r) => {
		const cols = cells.map((cell, c) => {
			const ref = `${columnName(c)}${r + 1}`;
			const style = r === 0 ? ' s="1"' : '';
			if (cell === '') return '';
			if (NUMBER.test(cell) && cell.length < 16) return `<c r="${ref}"${style}><v>${cell}</v></c>`;
			return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
		}).join('');
		return `<row r="${r + 1}">${cols}</row>`;
	}).join('');
	return `${XML_HEADER}<worksheet xmlns="${NS_MAIN}"><sheetData>${body}</sheetData></worksheet>`;
}

const STYLES = `${XML_HEADER}<styleSheet xmlns="${NS_MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

async function buildXlsx({ extensionPath, markdown }) {
	const tables = extractTables(markdown);
	if (tables.length === 0) throw new Error('No table found. Write a Markdown table (| a | b |) to export it as Excel.');
	const JSZip = require(path.join(extensionPath, 'office', 'node_modules', 'jszip'));
	const names = sheetNames(tables);
	const zip = new JSZip();
	const sheetParts = names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
	zip.file('[Content_Types].xml', `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetParts}</Types>`);
	zip.file('_rels/.rels', `${XML_HEADER}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
	zip.file('xl/workbook.xml', `${XML_HEADER}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${names.map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
	zip.file('xl/_rels/workbook.xml.rels', `${XML_HEADER}<Relationships xmlns="${NS_PKG_REL}">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`);
	zip.file('xl/styles.xml', STYLES);
	tables.forEach((table, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(table.rows)));
	return { bytes: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), sheets: names };
}

module.exports = { buildXlsx, extractTables, columnName, MAX_SHEETS, MAX_ROWS };

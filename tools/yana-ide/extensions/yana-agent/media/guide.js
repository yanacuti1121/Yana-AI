'use strict';
// Trang "sách hướng dẫn": đọc Markdown (media/guide.vi.md) và dựng thành trang có mục lục. Không dùng innerHTML:
// phần phân tích (parse, inline) là hàm thuần để kiểm thử bằng Node (tests/guide.test.cjs); phần dựng DOM chỉ dùng
// textContent. Hỗ trợ đúng những gì sách dùng: tiêu đề #/##/###, đoạn, trích dẫn, danh sách (một cấp lồng), khối
// code, bảng, và trong dòng: `code`, **đậm**, *nghiêng*.
(function (root, factory) {
	if (typeof module === 'object' && module.exports) module.exports = factory();
	else root.YanaGuide = factory();
})(this, function () {
	const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)/;
	const ORDERED = /^(\d+)\.\s+(.*)$/;
	const BULLET = /^[-*]\s+(.*)$/;
	const NESTED = /^\s{2,}[-*]\s+(.*)$/;
	const TABLE_SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

	// Cắt một dòng thành các đoạn { kind: 'text'|'code'|'strong'|'em', text }.
	function inline(text) {
		const tokens = [];
		let rest = text;
		while (rest) {
			const match = INLINE.exec(rest);
			if (!match) { tokens.push({ kind: 'text', text: rest }); break; }
			if (match.index) tokens.push({ kind: 'text', text: rest.slice(0, match.index) });
			const raw = match[0];
			if (match[1]) tokens.push({ kind: 'code', text: raw.slice(1, -1) });
			else if (match[2]) tokens.push({ kind: 'strong', text: raw.slice(2, -2) });
			else tokens.push({ kind: 'em', text: raw.slice(1, -1) });
			rest = rest.slice(match.index + raw.length);
		}
		return tokens;
	}

	function slug(text, taken) {
		const base = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
		let id = base;
		for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
		taken.add(id);
		return id;
	}

	function splitRow(line) {
		return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
	}

	function readTable(lines, start) {
		const header = splitRow(lines[start]);
		const rows = [];
		let i = start + 2;
		while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(splitRow(lines[i])); i += 1; }
		return { block: { type: 'table', header, rows }, next: i };
	}

	function readList(lines, start) {
		const ordered = ORDERED.test(lines[start]);
		const items = [];
		let i = start;
		for (; i < lines.length; i++) {
			const nested = NESTED.exec(lines[i]);
			const main = (ordered ? ORDERED : BULLET).exec(lines[i]);
			if (nested && items.length) items[items.length - 1].children.push(nested[1]);
			else if (main) items.push({ text: ordered ? main[2] : main[1], children: [] });
			else break;
		}
		return { block: { type: ordered ? 'ol' : 'ul', items }, next: i };
	}

	function readQuote(lines, start) {
		const text = [];
		let i = start;
		for (; i < lines.length && lines[i].startsWith('>'); i++) text.push(lines[i].replace(/^>\s?/, ''));
		return { block: { type: 'quote', lines: text }, next: i };
	}

	function readCode(lines, start) {
		const code = [];
		let i = start + 1;
		for (; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
		return { block: { type: 'code', text: code.join('\n'), closed: i < lines.length }, next: i + 1 };
	}

	// Trả về mảng khối: h1/h2/h3 (có id), p, quote, ul, ol, code, table.
	function parse(markdown) {
		const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
		const blocks = [];
		const taken = new Set();
		let paragraph = [];
		const flush = () => { if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') }); paragraph = []; };
		for (let i = 0; i < lines.length;) {
			const line = lines[i];
			const heading = /^(#{1,3})\s+(.*)$/.exec(line);
			let read = null;
			if (heading) { flush(); blocks.push({ type: `h${heading[1].length}`, text: heading[2], id: slug(heading[2], taken) }); i += 1; continue; }
			if (line.startsWith('```')) read = readCode(lines, i);
			else if (line.startsWith('>')) read = readQuote(lines, i);
			else if (line.trim().startsWith('|') && TABLE_SEPARATOR.test((lines[i + 1] || '').trim())) read = readTable(lines, i);
			else if (ORDERED.test(line) || BULLET.test(line)) read = readList(lines, i);
			if (read) { flush(); blocks.push(read.block); i = read.next; continue; }
			if (line.trim() === '') flush(); else paragraph.push(line.trim());
			i += 1;
		}
		flush();
		return blocks;
	}

	// ---- dựng DOM (chỉ chạy trong webview)
	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function fill(parent, text) {
		for (const token of inline(text)) {
			if (token.kind === 'text') parent.append(document.createTextNode(token.text));
			else parent.append(el({ code: 'code', strong: 'strong', em: 'em' }[token.kind], '', token.text));
		}
		return parent;
	}

	function listNode(block) {
		const list = el(block.type);
		for (const item of block.items) {
			const li = fill(el('li'), item.text);
			if (item.children.length) {
				const sub = el('ul');
				item.children.forEach(child => sub.append(fill(el('li'), child)));
				li.append(sub);
			}
			list.append(li);
		}
		return list;
	}

	function tableNode(block) {
		const wrap = el('div', 'table-wrap');
		const table = el('table');
		const head = el('tr');
		block.header.forEach(cell => head.append(fill(el('th'), cell)));
		const thead = el('thead');
		thead.append(head);
		table.append(thead);
		const body = el('tbody');
		for (const row of block.rows) {
			const tr = el('tr');
			block.header.forEach((_, index) => tr.append(fill(el('td'), row[index] || '')));
			body.append(tr);
		}
		table.append(body);
		wrap.append(table);
		return wrap;
	}

	function blockNode(block) {
		switch (block.type) {
			case 'h1': case 'h2': case 'h3': { const node = el(block.type, '', block.text); node.id = block.id; return node; }
			case 'p': return fill(el('p'), block.text);
			case 'quote': { const box = el('aside', 'callout'); block.lines.forEach(line => line.trim() && box.append(fill(el('p'), line))); return box; }
			case 'ul': case 'ol': return listNode(block);
			case 'code': return el('pre', 'code', block.text);
			case 'table': return tableNode(block);
			default: return el('span');
		}
	}

	function render(app, markdown) {
		const blocks = parse(markdown);
		const headingCount = blocks.filter(block => block.type === 'h2').length;
		const toc = el('nav', 'toc');
		const list = el('div', 'toc-list');
		const toggle = el('button', 'toc-toggle');
		const setOpen = open => {
			list.hidden = !open;
			toggle.setAttribute('aria-expanded', String(open));
			toggle.textContent = (open ? '\u25BE' : '\u25B8') + ' Contents (' + headingCount + ')';
		};
		const content = el('main', 'content');
		for (const block of blocks) {
			if (block.type === 'h2') {
				const link = el('button', 'toc-link', block.text);
				link.addEventListener('click', () => {
					setOpen(false);
					document.getElementById(block.id)?.scrollIntoView({ block: 'start' });
				});
				list.append(link);
			}
			content.append(blockNode(block));
		}
		toggle.addEventListener('click', () => setOpen(list.hidden));
		setOpen(false);
		toc.append(toggle, list);
		const top = el('button', 'to-top', '\u2191 Back to top');
		top.addEventListener('click', () => window.scrollTo({ top: 0 }));
		content.append(top);
		const layout = el('div', 'layout');
		layout.append(toc, content);
		app.replaceChildren(layout);
	}

	return { parse, inline, render };
});

// Khởi động trong webview: nhận Markdown từ extension rồi dựng trang.
if (typeof document !== 'undefined' && typeof acquireVsCodeApi === 'function') {
	const vscode = acquireVsCodeApi();
	window.addEventListener('message', ({ data }) => {
		if (data?.type === 'guide') window.YanaGuide.render(document.getElementById('app'), String(data.markdown || ''));
	});
	vscode.postMessage({ type: 'ready' });
}

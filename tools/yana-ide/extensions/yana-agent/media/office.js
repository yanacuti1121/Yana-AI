'use strict';
// Màn Yana Office. Dựng bằng DOM và textContent, không dùng thuộc tính HTML thô với dữ liệu từ host.
// Khung xem trước slide là iframe sandbox="" (không chạy script, không mạng) nhận nội dung qua srcdoc.
(function () {
	const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
	const STARTER = '---\nmarp: true\n---\n\n# My first deck\n\nWrite slides in Markdown.\n\n---\n\n## Second slide\n\n- Point one\n- Point two\n';
	let tools = [];
	let markdown = STARTER;
	let busy = false;
	let preview;
	let status;
	let buttons = [];

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function setStatus(text, isError) {
		if (!status) return;
		status.textContent = text;
		status.className = isError ? 'status error' : 'status';
	}

	function setBusy(value) {
		busy = value;
		for (const button of buttons) button.disabled = value;
	}

	function send(type, extra) {
		if (!vscode || busy) return;
		setBusy(true);
		setStatus(type === 'preview' ? 'Building preview…' : 'Waiting for you to choose where to save…', false);
		vscode.postMessage({ type, markdown, ...extra });
	}

	function isAvailable(id) {
		return tools.some(tool => tool.id === id && tool.available);
	}

	function slidesCard() {
		const card = el('section', 'card');
		card.appendChild(el('h2', '', 'Slides from Markdown'));
		if (!isAvailable('marp')) {
			card.appendChild(el('p', '', 'Not available yet. Install the Marp tool to write and export slides.'));
			return card;
		}
		const label = el('label', '', 'Slide text (Markdown, a line with --- starts a new slide)');
		label.htmlFor = 'slide-text';
		const area = el('textarea', 'editor');
		area.id = 'slide-text';
		area.value = markdown;
		area.spellcheck = false;
		area.addEventListener('input', () => { markdown = area.value; });
		const row = el('div', 'row');
		buttons = [];
		for (const [text, handler] of [
			['Preview', () => send('preview')],
			['Export PDF', () => send('export', { format: 'pdf' })],
			['Export PPTX (images)', () => send('export', { format: 'pptx' })],
		].concat(isAvailable('pptx') ? [['Export PPTX (editable)', () => send('export', { format: 'pptx-edit' })]] : [])) {
			const button = el('button', 'btn', text);
			button.type = 'button';
			button.addEventListener('click', handler);
			buttons.push(button);
			row.appendChild(button);
		}
		status = el('p', 'status');
		status.setAttribute('role', 'status');
		preview = el('iframe', 'preview');
		preview.setAttribute('sandbox', '');
		preview.title = 'Slide preview';
		card.append(label, area, row, status, preview);
		return card;
	}

	function render() {
		const app = document.getElementById('app');
		app.replaceChildren();
		app.appendChild(el('h1', '', 'Yana Office'));
		app.appendChild(el('p', 'lead', 'Slides, reports and PowerPoint files. Saving a file always asks where to put it first.'));
		app.appendChild(slidesCard());
		for (const tool of tools.filter(item => item.id !== 'marp')) {
			const card = el('section', 'card');
			card.appendChild(el('h2', '', tool.label));
			card.appendChild(el('p', '', tool.purpose));
			card.appendChild(el('span', tool.available ? 'badge ok' : 'badge off', tool.note));
			app.appendChild(card);
		}
	}

	window.addEventListener('message', event => {
		const data = event.data;
		if (!data) return;
		if (data.type === 'status' && Array.isArray(data.tools)) { tools = data.tools; render(); return; }
		if (data.type === 'busy') { setStatus('Exporting… this can take a few seconds.', false); return; }
		if (data.type === 'preview') {
			setBusy(false);
			if (preview) preview.srcdoc = `<style>body{margin:0;background:#fff}${String(data.css)}</style>${String(data.html)}`;
			setStatus('Preview ready.', false);
		} else if (data.type === 'exported') {
			setBusy(false);
			setStatus(data.cancelled ? 'Export cancelled.' : `Saved to ${data.path}`, false);
		} else if (data.type === 'error') {
			setBusy(false);
			setStatus(data.message || 'Something went wrong.', true);
		}
	});
	if (vscode) vscode.postMessage({ type: 'ready' });
})();

'use strict';
// Giao diện Yana Control Center. Chỉ dựng DOM bằng textContent; không có hành động nào ngoài làm mới và hai phép kiểm.
(function () {
	const vscode = acquireVsCodeApi();
	const app = document.getElementById('app');
	const verified = new Map(); // kind -> { ok, message }
	let last;

	// Nút kiểm đầy đủ gắn vào mục "Yana AI pack in this folder".
	const VERIFY_BUTTONS = { pack: [['coreLock', 'Verify core lock'], ['auditChain', 'Verify audit chain']] };
	const LABELS = { ok: 'OK', warn: 'Check', bad: 'Problem', off: 'Off', unknown: 'Unknown', info: '' };

	function el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function itemRow(entry) {
		const row = el('div', 'row');
		const text = el('div', 'row-text');
		text.append(el('div', 'row-label', entry.label));
		if (entry.detail) text.append(el('div', 'row-detail', entry.detail));
		const value = el('div', 'row-value');
		if (LABELS[entry.state]) value.append(el('span', `badge ${entry.state}`, LABELS[entry.state]));
		value.append(el('span', 'value-text', entry.value));
		row.append(text, value);
		return row;
	}

	function verifyBar(section) {
		const buttons = VERIFY_BUTTONS[section.id];
		if (!buttons) return null;
		const bar = el('div', 'verify-bar');
		for (const [kind, label] of buttons) {
			const button = el('button', 'btn', label);
			button.addEventListener('click', () => {
				button.disabled = true;
				button.textContent = `${label}…`;
				vscode.postMessage({ type: 'verify', kind });
			});
			bar.append(button);
			if (verified.has(kind)) {
				const result = verified.get(kind);
				const note = el('p', `verify-note ${result.ok ? 'ok' : 'bad'}`);
				note.append(el('strong', null, `${result.label}: ${result.ok ? 'passed' : 'failed'}. `), document.createTextNode(result.message));
				bar.append(note);
			}
		}
		return bar;
	}

	function render(snapshot) {
		const page = el('main', 'page');
		const head = el('div', 'head');
		head.append(el('h1', null, 'Yana Control Center'));
		const refresh = el('button', 'btn', 'Refresh');
		refresh.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
		head.append(refresh);
		page.append(head);
		if (snapshot.error) {
			page.append(el('p', 'lead', snapshot.error));
			app.replaceChildren(page);
			return;
		}
		page.append(el('p', 'lead', `Live status of Yana AI in ${snapshot.root}. Every line is read from a file or a read-only command, nothing is assumed. Read at ${new Date(snapshot.generatedAt).toLocaleTimeString()}.`));
		for (const section of snapshot.sections) {
			const group = el('section', 'group');
			group.append(el('h2', null, section.title));
			section.items.forEach(entry => group.append(itemRow(entry)));
			const bar = verifyBar(section);
			if (bar) group.append(bar);
			page.append(group);
		}
		app.replaceChildren(page);
	}

	window.addEventListener('message', ({ data }) => {
		if (data?.type === 'snapshot') { last = data.snapshot; render(last); }
		if (data?.type === 'verified') {
			verified.set(data.kind, { ok: data.ok, message: String(data.message || ''), label: String(data.label || data.kind) });
			if (last) render(last);
		}
	});
	vscode.postMessage({ type: 'ready' });
})();

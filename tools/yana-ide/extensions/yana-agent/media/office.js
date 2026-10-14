'use strict';
// Man Yana Office. Dung bang DOM va textContent, khong dung thuoc tinh HTML tho voi du lieu tu host.
// Khung xem truoc slide la iframe sandbox="" (khong chay script, khong mang) nhan noi dung qua srcdoc.
(function () {
	const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
	const TEMPLATES = {
		starter: {
			label: 'Starter',
			markdown: '---\nmarp: true\npaginate: true\n---\n\n# My First Deck\n\nWrite slides in Markdown.\n\n---\n\n## Second Slide\n\n- Point one\n- Point two\n- Point three\n'
		},
		pitch: {
			label: 'Project Pitch',
			markdown: '---\nmarp: true\ntheme: gaia\npaginate: true\n_class: lead\n---\n\n# Project Title\n\nElevator pitch or core mission statement\n\n---\n\n## The Problem\n\n- Fragmented developer workflows across too many tools\n- Context loss between specifications and execution\n- High latency in local AI inference\n\n---\n\n## The Solution\n\n- Unified Agentic IDE with direct runtime supervision\n- Offline-first model execution with strict audit gate\n- Real-time visual canvas and document authoring\n\n---\n\n## Market Impact\n\n| Capability | Industry Standard | Yana Studio |\n| :--- | :--- | :--- |\n| Sandboxed Tools | Partial | 100% Deterministic |\n| Model Agnostic | Vendor Locked | 40+ Providers |\n| Office Tools | Cloud Only | Local Marp + Pptx |\n\n---\n\n## Roadmap & Next Steps\n\n1. Enterprise pilot rollout\n2. Performance benchmarking\n3. Autonomous verification loops\n'
		},
		architecture: {
			label: 'Tech Architecture',
			markdown: '---\nmarp: true\ntheme: default\npaginate: true\n---\n\n# System Architecture\n\nEngineering design specification\n\n---\n\n## Architectural Layers\n\n- **Client**: Code-OSS IDE shell with custom webview panels\n- **Extension**: yana-agent managing state and IPC\n- **Runtime Engine**: yana-rt Rust daemon (BFT consensus)\n- **Guard**: Stop and PreToolUse safety hooks\n\n---\n\n## Component Topology\n\n- Webview UI communicates exclusively via nonce postMessage\n- Tool execution is gated by user approval dialogs\n- Persistent memory tier: L1 atomic facts in Git\n\n---\n\n## Reliability & Security\n\n- Read-only tools bypass human approval\n- Destructive actions strictly blocked\n- Zero unauthorized network egress\n'
		},
		meeting: {
			label: 'Meeting Sync',
			markdown: '---\nmarp: true\ntheme: uncover\npaginate: true\n---\n\n# Weekly Sprint Sync\n\nEngineering team progress review\n\n---\n\n## What Shipped\n\n- Yana Office: live slide preview and editable PPTX\n- Composer layout: unified flex toolbar\n- Default window proportions calibrated\n\n---\n\n## In Flight\n\n- Document parser integration\n- Presentation mode enhancements\n- Local model provider discovery\n\n---\n\n## Blockers & Decisions\n\n- Package distribution review\n- Automated test coverage signoff\n'
		},
		data: {
			label: 'Data & Tables',
			markdown: '---\nmarp: true\ntheme: gaia\npaginate: true\n---\n\n# Performance Metrics\n\nBenchmark summary report\n\n---\n\n## Execution Benchmarks\n\n| Scenario | Baseline | Yana Studio | Speedup |\n| :--- | :--- | :--- | :--- |\n| Slide Render | 1400 ms | 120 ms | 11.6x |\n| PDF Export | 3200 ms | 850 ms | 3.7x |\n| PPTX Build | 950 ms | 90 ms | 10.5x |\n\n---\n\n## Key Takeaways\n\n- All render pipelines well within latency budget\n- Zero memory degradation under continuous preview\n'
		}
	};

	let tools = [];
	let markdown = TEMPLATES.starter.markdown;
	let busy = false;
	let splitView = false;
	let preview;
	let textArea;
	let status;
	let statsBadge;
	let workspace;
	let exitFullscreenBtn;
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
		const waiting = { preview: 'Building preview…', open: 'Waiting for you to choose a file…', 'insert-image': 'Waiting for you to choose an image…' };
		setStatus(waiting[type] || 'Waiting for you to choose where to save…', false);
		vscode.postMessage({ type, markdown, ...extra });
	}

	function updateStats() {
		if (!statsBadge) return;
		const slides = (markdown.match(/(?:^|\n)---\n/g) || []).length + 1;
		const words = markdown.trim().split(/\s+/).filter(Boolean).length;
		statsBadge.textContent = `${slides} slides · ~${words} words · ~${Math.max(1, slides)} min`;
	}

	function insertAtCursor(text) {
		if (!textArea) return;
		const start = textArea.selectionStart ?? textArea.value.length;
		const end = textArea.selectionEnd ?? start;
		textArea.value = textArea.value.slice(0, start) + text + textArea.value.slice(end);
		textArea.selectionStart = textArea.selectionEnd = start + text.length;
		markdown = textArea.value;
		updateStats();
	}

	function isAvailable(id) {
		return tools.some(tool => tool.id === id && tool.available);
	}

	function loadTemplate(key) {
		const tpl = TEMPLATES[key];
		if (!tpl) return;
		markdown = tpl.markdown;
		if (textArea) textArea.value = markdown;
		updateStats();
		if (isAvailable('marp')) send('preview');
	}

	function applyTheme(themeName) {
		if (!textArea) return;
		let text = textArea.value;
		if (/^theme:\s*\w+/m.test(text)) {
			text = text.replace(/^theme:\s*\w+/m, `theme: ${themeName}`);
		} else if (/^---\n/m.test(text)) {
			text = text.replace(/^---\n/, `---\ntheme: ${themeName}\n`);
		} else {
			text = `---\nmarp: true\ntheme: ${themeName}\n---\n\n` + text;
		}
		textArea.value = text;
		markdown = text;
		updateStats();
		if (isAvailable('marp')) send('preview');
	}

	function toggleInvert() {
		if (!textArea) return;
		let text = textArea.value;
		if (/_class:\s*invert/m.test(text) || /class:\s*invert/m.test(text)) {
			text = text.replace(/_?class:\s*invert\n?/gm, '');
		} else if (/^---\n/m.test(text)) {
			text = text.replace(/^---\n/, `---\nclass: invert\n`);
		} else {
			text = `---\nmarp: true\nclass: invert\n---\n\n` + text;
		}
		textArea.value = text;
		markdown = text;
		updateStats();
		if (isAvailable('marp')) send('preview');
	}

	function togglePaginate() {
		if (!textArea) return;
		let text = textArea.value;
		if (/paginate:\s*true/m.test(text)) {
			text = text.replace(/paginate:\s*true\n?/gm, '');
		} else if (/^---\n/m.test(text)) {
			text = text.replace(/^---\n/, `---\npaginate: true\n`);
		} else {
			text = `---\nmarp: true\npaginate: true\n---\n\n` + text;
		}
		textArea.value = text;
		markdown = text;
		updateStats();
		if (isAvailable('marp')) send('preview');
	}

	function togglePresentationMode() {
		if (!preview) return;
		preview.classList.toggle('expanded');
		if (exitFullscreenBtn) {
			exitFullscreenBtn.style.display = preview.classList.contains('expanded') ? 'block' : 'none';
		}
	}

	function exitPresentationMode() {
		if (!preview) return;
		preview.classList.remove('expanded');
		if (exitFullscreenBtn) exitFullscreenBtn.style.display = 'none';
	}

	function toggleSplitView() {
		splitView = !splitView;
		if (workspace) {
			if (splitView) workspace.classList.add('split');
			else workspace.classList.remove('split');
		}
	}

	function copyMarkdown() {
		if (navigator.clipboard && markdown) {
			navigator.clipboard.writeText(markdown);
			setStatus('Markdown copied to clipboard.', false);
		}
	}

	function clearEditor() {
		markdown = '---\nmarp: true\npaginate: true\n---\n\n# New Slide\n\nWrite your content here.\n';
		if (textArea) textArea.value = markdown;
		updateStats();
		if (isAvailable('marp')) send('preview');
	}

	function slidesCard() {
		const card = el('section', 'card');
		buttons = [];

		const headerRow = el('div', 'card-header-row');
		const title = el('h2', '', 'Slides and Documents from Markdown');
		const headerActions = el('div', 'header-actions');

		statsBadge = el('span', 'badge stat', '1 slide');
		const splitBtn = el('button', 'btn btn-secondary btn-small', 'Toggle Split View');
		splitBtn.type = 'button';
		splitBtn.addEventListener('click', toggleSplitView);

		const presentBtn = el('button', 'btn btn-secondary btn-small', 'Present (Fullscreen)');
		presentBtn.type = 'button';
		presentBtn.addEventListener('click', togglePresentationMode);

		headerActions.append(statsBadge, splitBtn, presentBtn);
		headerRow.append(title, headerActions);
		card.appendChild(headerRow);

		if (!isAvailable('marp')) {
			card.appendChild(el('p', '', 'Not available yet. Install the Marp tool to write and export slides.'));
			return card;
		}

		const templateToolbar = el('div', 'toolbar-section');
		templateToolbar.appendChild(el('span', 'toolbar-label', 'Templates:'));
		for (const [key, tpl] of Object.entries(TEMPLATES)) {
			const btn = el('button', 'btn btn-secondary btn-small', tpl.label);
			btn.type = 'button';
			btn.addEventListener('click', () => loadTemplate(key));
			templateToolbar.appendChild(btn);
		}
		card.appendChild(templateToolbar);

		const styleToolbar = el('div', 'toolbar-section');
		styleToolbar.appendChild(el('span', 'toolbar-label', 'Theme:'));
		const themes = ['default', 'gaia', 'uncover'];
		for (const th of themes) {
			const btn = el('button', 'btn btn-secondary btn-small', th.charAt(0).toUpperCase() + th.slice(1));
			btn.type = 'button';
			btn.addEventListener('click', () => applyTheme(th));
			styleToolbar.appendChild(btn);
		}
		styleToolbar.appendChild(el('span', 'toolbar-label', 'Options:'));
		const invertBtn = el('button', 'btn btn-secondary btn-small', 'Dark Slide');
		invertBtn.type = 'button';
		invertBtn.addEventListener('click', toggleInvert);

		const paginateBtn = el('button', 'btn btn-secondary btn-small', 'Slide Numbers');
		paginateBtn.type = 'button';
		paginateBtn.addEventListener('click', togglePaginate);

		styleToolbar.append(invertBtn, paginateBtn);
		card.appendChild(styleToolbar);

		workspace = el('div', 'office-workspace' + (splitView ? ' split' : ''));
		const editorCol = el('div', 'workspace-col');
		const previewCol = el('div', 'workspace-col');

		const label = el('label', '', 'Slide Markdown text:');
		label.htmlFor = 'slide-text';
		const area = el('textarea', 'editor');
		area.id = 'slide-text';
		area.value = markdown;
		area.spellcheck = false;
		area.addEventListener('input', () => {
			markdown = area.value;
			updateStats();
		});
		textArea = area;

		const editorActions = el('div', 'row');
		const inputButtons = [
			['Open file…', () => send('open', { markdown: undefined })],
			['Insert image…', () => send('insert-image', { markdown: undefined })],
			['Preview', () => send('preview')],
			['Copy Markdown', copyMarkdown],
			['Clear', clearEditor],
		];
		for (const [text, handler] of inputButtons) {
			const button = el('button', 'btn', text);
			button.type = 'button';
			button.addEventListener('click', handler);
			buttons.push(button);
			editorActions.appendChild(button);
		}
		editorCol.append(label, area, editorActions);

		status = el('p', 'status');
		status.setAttribute('role', 'status');
		preview = el('iframe', 'preview');
		preview.setAttribute('sandbox', '');
		preview.title = 'Slide preview';

		exitFullscreenBtn = el('button', 'btn btn-secondary exit-fullscreen-btn', 'Exit Fullscreen (ESC)');
		exitFullscreenBtn.type = 'button';
		exitFullscreenBtn.style.display = 'none';
		exitFullscreenBtn.addEventListener('click', exitPresentationMode);

		previewCol.append(status, preview, exitFullscreenBtn);
		workspace.append(editorCol, previewCol);
		card.appendChild(workspace);

		const exportSection = el('div', 'export-group');
		const slideExportTitle = el('div', 'export-title', 'Slide Exports:');
		const slideExportRow = el('div', 'row');
		const slideButtons = [
			['Export PDF', () => send('export', { format: 'pdf' })],
			['Export HTML', () => send('export', { format: 'html' })],
			['Export PPTX (images)', () => send('export', { format: 'pptx' })],
		].concat(isAvailable('pptx') ? [['Export PPTX (editable)', () => send('export', { format: 'pptx-edit' })]] : []);

		for (const [text, handler] of slideButtons) {
			const button = el('button', 'btn', text);
			button.type = 'button';
			button.addEventListener('click', handler);
			buttons.push(button);
			slideExportRow.appendChild(button);
		}

		const docExportTitle = el('div', 'export-title', 'Document & Data Exports:');
		const docExportRow = el('div', 'row');
		const docButtons = [
			['Export Word (.docx)', () => send('export', { format: 'docx' })],
			['Export ODT', () => send('export', { format: 'odt' })],
			['Export Excel (tables)', () => send('export', { format: 'xlsx' })],
			['Save Markdown', () => send('export', { format: 'md' })],
		];
		for (const [text, handler] of docButtons) {
			const button = el('button', 'btn', text);
			button.type = 'button';
			button.addEventListener('click', handler);
			buttons.push(button);
			docExportRow.appendChild(button);
		}

		exportSection.append(slideExportTitle, slideExportRow, docExportTitle, docExportRow);
		card.appendChild(exportSection);

		updateStats();
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

	window.addEventListener('keydown', event => {
		if (event.key === 'Escape') exitPresentationMode();
	});

	window.addEventListener('message', event => {
		const data = event.data;
		if (!data) return;
		if (data.type === 'status' && Array.isArray(data.tools)) { tools = data.tools; render(); if (isAvailable('marp')) send('preview'); return; }
		if (data.type === 'busy') { setStatus('Exporting… this can take a few seconds.', false); return; }
		if (data.type === 'load-markdown') {
			if (typeof data.text === 'string') {
				markdown = data.text;
				if (textArea) textArea.value = markdown;
				updateStats();
				if (isAvailable('marp')) send('preview');
			}
			return;
		}
		if (data.type === 'preview') {
			setBusy(false);
			if (preview) preview.srcdoc = `<style>body{margin:0;background:#fff}${String(data.css)}</style>${String(data.html)}`;
			setStatus(data.note ? `Preview ready. ${data.note}.` : 'Preview ready.', false);
		} else if (data.type === 'exported') {
			setBusy(false);
			setStatus(data.cancelled ? 'Export cancelled.' : `Saved to ${data.path}${data.note ? `. ${data.note}.` : ''}`, false);
		} else if (data.type === 'opened') {
			setBusy(false);
			if (data.cancelled) { setStatus('Open cancelled.', false); return; }
			markdown = String(data.text);
			if (textArea) textArea.value = markdown;
			updateStats();
			setStatus(`Opened ${data.name}${data.notice ? `. ${data.notice}` : ''}`, false);
			if (isAvailable('marp')) send('preview');
		} else if (data.type === 'image') {
			setBusy(false);
			if (data.cancelled) { setStatus('No image chosen.', false); return; }
			insertAtCursor(`\n![${String(data.alt).replace(/[\[\]\n]/g, ' ')}](${String(data.ref)})\n`);
			setStatus('Image inserted. It is embedded when you preview or export.', false);
		} else if (data.type === 'error') {
			setBusy(false);
			setStatus(data.message || 'Something went wrong.', true);
		}
	});
	if (vscode) vscode.postMessage({ type: 'ready' });
})();

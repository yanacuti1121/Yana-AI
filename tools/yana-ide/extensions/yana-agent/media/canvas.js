// Webview của Design Canvas. Cột trái: sandbox, chọn model, lịch sử yêu cầu, ô mô tả. Bên phải: tab màn
// hình, thanh xem trực tiếp khi AI đang viết, khung xem trước hoặc chế độ so sánh tối đa 3 màn. Khung xem
// trước là iframe sandbox="" (không chạy script, không mạng) nhận HTML qua srcdoc. DOM chỉ dựng bằng
// textContent.
(function () {
	'use strict';
	const vscode = acquireVsCodeApi();
	const LIVE_RENDER_MS = 350; // cập nhật khung xem trước tối đa ~3 lần/giây khi đang stream (giữ máy mát)
	const MAX_COMPARE = 3;
	const { WIDTH, el, button, kb, time, makeFrame, fitFrames, extractHtml } = window.YanaCanvasUI;
	const state = { data: null, providers: [], selected: '', busy: false, mode: 'new', live: '', liveTimer: 0, device: 'desktop', compare: false, startedAt: 0, clock: 0, model: '' };

	// ----- cột trái -----
	const app = document.getElementById('app');
	const side = el('aside', 'side');
	const main = el('main', 'main');
	app.append(side, main);

	const titleRow = el('div', 'title-row');
	const emblem = el('img', 'emblem');
	emblem.src = document.body.dataset.emblem || '';
	emblem.alt = '';
	const title = el('h1', 'title', 'Design Canvas');
	titleRow.append(emblem, title);
	const sandbox = el('div', 'sandbox');
	sandbox.append(el('strong', '', 'Isolated design sandbox. '), el('span', '', 'The AI designs in an empty folder: it cannot read or change project files. Only Export writes into the project.'));
	const modelHead = el('div', 'label-row');
	const keyBadge = el('span', 'badge');
	modelHead.append(el('span', 'label', 'Design model'), keyBadge);
	const modelRow = el('div', 'model-row');
	const providerSelect = el('select');
	providerSelect.setAttribute('aria-label', 'Provider');
	const modelInput = el('input');
	modelInput.type = 'text';
	modelInput.setAttribute('aria-label', 'Model ID');
	const modelList = el('datalist');
	modelList.id = 'model-options';
	modelInput.setAttribute('list', 'model-options');
	const keyButton = button('Key', '', () => vscode.postMessage({ type: 'setKey', provider: providerSelect.value }), 'Save an API key for this provider');
	modelRow.append(providerSelect, modelInput, modelList, keyButton);
	const saveModel = () => vscode.postMessage({ type: 'setModel', provider: providerSelect.value, model: modelInput.value });
	providerSelect.addEventListener('change', () => { modelInput.value = ''; fillModels(); saveModel(); });
	modelInput.addEventListener('change', saveModel);

	const deviceRow = el('div', 'segmented');
	const deviceButtons = ['desktop', 'phone'].map(device => {
		const node = button(device === 'desktop' ? `Desktop (${WIDTH.desktop}px)` : `Phone (${WIDTH.phone}px)`, '', () => { state.device = device; renderDevice(); });
		node.dataset.device = device;
		return node;
	});
	deviceRow.append(...deviceButtons);
	const chat = el('div', 'chat');
	const liveItem = el('div', 'chat-item live');
	const activeNote = el('div', 'muted small');
	const prompt = el('textarea', 'prompt');
	prompt.rows = 4;
	prompt.placeholder = 'Describe a screen, for example: settings page for a code editor with a model picker and an API key form';
	const actions = el('div', 'row');
	const stopButton = button('Stop ■', 'danger', () => vscode.postMessage({ type: 'stop' }));
	const generateButton = button('Generate (⌘↵)', 'primary grow', () => send(state.selected && state.mode === 'refine' ? 'refine' : 'new'));
	actions.append(stopButton, generateButton);
	const status = el('div', 'status');
	status.setAttribute('role', 'status');
	side.append(titleRow, sandbox, modelHead, modelRow, el('span', 'label', 'Viewport'), deviceRow, el('span', 'label', 'Requests'), chat, activeNote, prompt, actions, status);

	// ----- bên phải -----
	const screensBar = el('div', 'screens');
	const toolbar = el('div', 'toolbar');
	const liveBar = el('div', 'live-bar');
	const stage = el('div', 'stage');
	const emptyStage = el('div', 'empty', 'No screens yet. Pick a model, describe a screen on the left and press Generate. You will see the AI build it here while it writes.');
	main.append(screensBar, toolbar, liveBar, stage);

	prompt.addEventListener('keydown', event => {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			generateButton.click();
		}
	});

	function send(mode) {
		const instruction = prompt.value.trim();
		if (mode !== 'variant' && !instruction) {
			status.textContent = 'Describe the screen first.';
			return;
		}
		vscode.postMessage({ type: 'generate', mode, instruction, screenId: mode === 'new' ? '' : state.selected, device: state.device });
		if (mode !== 'variant') prompt.value = '';
	}

	function currentProvider() {
		return state.providers.find(p => p.id === providerSelect.value);
	}
	function fillModels() {
		const provider = currentProvider();
		modelInput.placeholder = provider?.defaultModel || 'provider default';
		modelList.replaceChildren(...(provider?.models || []).map(id => { const o = el('option'); o.value = id; return o; }));
		keyBadge.textContent = !provider ? '' : !provider.needsKey ? 'No key needed' : provider.keyed ? 'Key saved' : 'Needs key';
		keyBadge.className = `badge ${provider && (!provider.needsKey || provider.keyed) ? 'ok' : 'warn'}`;
	}
	function renderModel() {
		if (!providerSelect.options.length) {
			for (const p of state.providers) {
				const option = el('option', '', `${p.label} · ${p.kind}`);
				option.value = p.id;
				providerSelect.append(option);
			}
		}
		providerSelect.value = state.data.provider || providerSelect.value || 'ollama';
		if (document.activeElement !== modelInput) modelInput.value = state.data.model || '';
		fillModels();
	}

	function renderChat() {
		const items = state.data.chat.slice(-30).map(entry => {
			const item = el('div', 'chat-item');
			const head = el('div', 'chat-head');
			const tag = entry.mode === 'refine' ? 'Refine' : entry.mode === 'variant' ? 'Variant' : 'New';
			head.append(el('span', `tag ${tag.toLowerCase()}`, tag), el('span', 'muted small', entry.at ? time(entry.at) : ''));
			item.append(head, el('div', '', entry.content || '(same request)'));
			return item;
		});
		chat.replaceChildren(...(items.length ? items : [el('div', 'muted small', 'Your requests appear here.')]));
		if (state.busy) chat.append(liveItem);
		chat.scrollTop = chat.scrollHeight;
	}

	function renderDevice() {
		for (const node of deviceButtons) node.classList.toggle('active', node.dataset.device === state.device);
		fitAll();
	}

	function selectedScreen() {
		return state.data?.screens.find(s => s.id === state.selected);
	}

	function renderScreens() {
		const screens = state.data.screens;
		if (state.selected && !screens.some(s => s.id === state.selected)) state.selected = '';
		if (!state.selected && screens.length && !state.busy && state.mode !== 'new') state.selected = screens[screens.length - 1].id;
		screensBar.replaceChildren(...screens.map(screen => {
			const tab = button(`${screen.name} · ${WIDTH[screen.device] || WIDTH.desktop}px`, screen.id === state.selected ? 'tab active' : 'tab', () => { state.selected = screen.id; state.mode = 'refine'; state.compare = false; render(); });
			tab.title = screen.prompt;
			return tab;
		}), button('+ New screen', 'tab ghost', () => { state.selected = ''; state.mode = 'new'; state.compare = false; render(); prompt.focus(); }));
		if (screens.length > 1) {
			screensBar.append(button(state.compare ? 'Exit compare' : `Compare (${Math.min(MAX_COMPARE, screens.length)})`, 'tab ghost', () => { state.compare = !state.compare; render(); }));
		}
		const screen = selectedScreen();
		toolbar.replaceChildren();
		if (screen && !state.compare) {
			toolbar.append(
				el('span', 'muted small grow', `${screen.device} · updated ${new Date(screen.updatedAt || screen.createdAt).toLocaleString()}`),
				button('Another variant', '', () => send('variant'), 'Generate a different take on the same request'),
				button('Rename', '', () => renameInline(screen)),
				button('Build this screen', 'primary', () => vscode.postMessage({ type: 'buildScreen', id: screen.id, html: screen.html, name: screen.name }), 'Send screen design to assistant to implement as code'),
				button('Export HTML', '', () => vscode.postMessage({ type: 'export', id: screen.id })),
				button('Delete', 'danger', () => vscode.postMessage({ type: 'deleteScreen', id: screen.id })),
			);
		} else if (state.compare) {
			toolbar.append(el('span', 'muted small grow', 'Comparing the selected screen with the most recent others. Pick one to keep working on it.'));
		}
		const refining = screen && state.mode === 'refine';
		activeNote.textContent = refining ? `Active: ${screen.name} selected. Your next message edits this screen.` : 'Creating a new screen.';
		generateButton.textContent = refining ? `Refine ${screen.name} (⌘↵)` : 'Generate (⌘↵)';
		if (!state.busy) showStage();
	}

	function renameInline(screen) {
		const input = el('input', 'rename');
		input.type = 'text';
		input.value = screen.name;
		const commit = () => vscode.postMessage({ type: 'renameScreen', id: screen.id, name: input.value });
		input.addEventListener('keydown', event => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') render(); });
		input.addEventListener('blur', commit);
		toolbar.replaceChildren(input);
		input.focus();
		input.select();
	}

	function showStage(liveHtml) {
		const screen = selectedScreen();
		if (state.compare && !liveHtml) {
			const others = state.data.screens.filter(s => s.id !== state.selected).slice(-(MAX_COMPARE - (screen ? 1 : 0)));
			const list = [...(screen ? [screen] : []), ...others].slice(0, MAX_COMPARE);
			stage.className = 'stage compare';
			stage.replaceChildren(...list.map(s => makeFrame(s.html, s.device, s.name, () => { state.selected = s.id; state.mode = 'refine'; state.compare = false; render(); })));
		} else {
			const html = liveHtml ?? screen?.html ?? '';
			stage.className = 'stage';
			stage.replaceChildren(html ? makeFrame(html, liveHtml ? (screen?.device || state.device) : screen?.device, '') : emptyStage);
		}
		fitAll();
	}

	const fitAll = () => fitFrames(stage);
	new ResizeObserver(fitAll).observe(stage);

	function renderLive() {
		const seconds = Math.round((Date.now() - state.startedAt) / 1000);
		const text = state.live ? `Writing HTML & CSS… ${kb(state.live)} received · ${seconds}s` : `Waiting for the model… ${seconds}s`;
		liveItem.textContent = text;
		liveBar.replaceChildren(el('span', 'live-dot'), el('strong', '', 'Live preview'), el('span', 'muted', `${state.model} · ${text}`));
		status.textContent = text;
	}
	function liveRender() {
		state.liveTimer = 0;
		const html = extractHtml(state.live);
		if (html) {
			const frame = stage.querySelector('.frame');
			if (frame && !state.compare) frame.srcdoc = html; else showStage(html);
		}
		renderLive();
	}

	function setBusy(busy) {
		state.busy = busy;
		generateButton.disabled = busy;
		stopButton.hidden = !busy;
		liveBar.hidden = !busy;
		for (const node of toolbar.querySelectorAll('button')) node.disabled = busy;
		clearInterval(state.clock);
		state.clock = busy ? setInterval(renderLive, 1000) : 0; // đồng hồ 1 giây chỉ chạy khi đang dựng
	}

	function render() {
		if (!state.data) return;
		title.textContent = state.data.title || 'Design Canvas';
		renderModel();
		renderChat();
		renderScreens();
		renderDevice();
	}

	function endGeneration(message) {
		clearTimeout(state.liveTimer);
		state.liveTimer = 0;
		setBusy(false);
		status.textContent = message;
		render();
	}

	window.addEventListener('message', ({ data }) => {
		if (data?.type === 'document') {
			if (!data.data) {
				status.textContent = 'This canvas file is not valid JSON. Fix it in a text editor.';
				return;
			}
			state.data = data.data;
			state.providers = data.providers || state.providers;
			render();
		} else if (data?.type === 'gen-start') {
			state.live = '';
			state.model = data.model || '';
			state.startedAt = Date.now();
			state.compare = false;
			setBusy(true);
			renderChat();
			showStage('');
			renderLive();
		} else if (data?.type === 'delta') {
			state.live += data.text || '';
			if (!state.liveTimer) state.liveTimer = setTimeout(liveRender, LIVE_RENDER_MS);
		} else if (data?.type === 'gen-done') {
			state.selected = data.screenId;
			state.mode = 'refine';
			endGeneration(`Done in ${Math.round((Date.now() - state.startedAt) / 1000)}s. Describe changes to refine this screen, or try another variant.`);
		} else if (data?.type === 'gen-error') {
			endGeneration(data.message || 'Generation failed.');
		}
	});

	setBusy(false);
	vscode.postMessage({ type: 'ready' });
})();

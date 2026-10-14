'use strict';
// Giao diện màn "Yana IDE". Chỉ dựng DOM bằng textContent; mọi thay đổi gửi về extension, extension kiểm tra lại
// rồi gửi trạng thái mới, nên màn luôn hiện giá trị thật chứ không phải giá trị người dùng vừa bấm.
(function () {
	const vscode = acquireVsCodeApi();
	const app = document.getElementById('app');
	let notice = '';

	function el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	}
	function send(message) { notice = ''; vscode.postMessage(message); }
	function button(label, message, cls) {
		const node = el('button', cls || 'btn', label);
		node.addEventListener('click', () => send(message));
		return node;
	}
	function toggle(checked, type) {
		const node = el('input');
		node.type = 'checkbox';
		node.checked = checked;
		node.addEventListener('change', () => send({ type, value: node.checked }));
		return node;
	}
	function row(label, note, control) {
		const node = el('div', 'row');
		const text = el('div', 'row-text');
		text.append(el('div', 'row-label', label), el('div', 'row-note', note));
		node.append(text, control);
		return node;
	}
	function group(title, ...rows) {
		const node = el('section', 'group');
		node.append(el('h2', null, title), ...rows);
		return node;
	}
	function inline(...controls) {
		const node = el('div', 'inline');
		node.append(...controls);
		return node;
	}
	function label(text, tone) { return el('span', 'badge' + (tone ? ` ${tone}` : ''), text); }

	function guideGroup(state) {
		return group('User guide',
			row('Open the guide on first start', 'Opens the step-by-step manual once, next to Yana Home.', toggle(state.guide.autoOpen, 'setGuideAutoOpen')),
			row('Show the guide again', state.guide.seen ? 'It has already opened once. This makes it open again at the next start.' : 'It will open at the next start.',
				inline(button('Show again at next start', { type: 'showGuideAgain' }), button('Open now', { type: 'openGuide' }))));
	}

	function homeGroup(state) {
		return group('Start page',
			row('Open Yana Home at startup', 'Only when no file is open.', toggle(state.home.showOnStartup, 'setHomeOnStartup')));
	}

	function approvalGroup(state) {
		const a = state.approvals;
		let status = label('Folder not open', 'warn');
		if (a.hasFolder) status = a.active ? label('On', 'ok') : label('Off', 'bad');
		const action = a.hasFolder && !a.active
			? button('Turn on approvals in this project', { type: 'enableApprovals' })
			: el('span', 'muted', a.hasFolder ? 'Nothing to do.' : 'Open a folder first.');
		const note = a.trusted ? 'Yana stops and asks before every command or file change. Without this file, yana-rt cannot store a pending approval.'
			: 'This folder is in Restricted Mode. Trust it before turning approvals on.';
		return group('Approvals', row('Approval store for this project', note, inline(status, action)));
	}

	function assistantGroup(state) {
		const { items, selectedId } = state.assistants;
		if (!items.length) return group('Assistant', row('Default assistant', 'Open the Yana chat panel once, then come back.', el('span', 'muted', 'No assistants yet')));
		const select = el('select');
		for (const item of items) {
			const option = el('option', null, `${item.name} (${item.provider || 'default'} / ${item.model || 'default'})`);
			option.value = item.id;
			option.selected = item.id === selectedId;
			select.append(option);
		}
		select.addEventListener('change', () => send({ type: 'selectAssistant', id: select.value }));
		const current = items.find(item => item.id === selectedId);
		return group('Assistant',
			row('Default assistant', (current?.description || 'Choose how Yana should work.') + ' Today an assistant only changes the provider and model.', select));
	}

	function runtimeGroup(state) {
		const r = state.runtime;
		return group('Model and runtime',
			row('Current chat model', `${r.provider || 'not set'} / ${r.model || 'default'}`, button('Models and runtime', { type: 'openModels' })),
			row('yana-rt', r.path || 'not found. Open Models and runtime to choose it.', button('Yana Settings', { type: 'openSettings' })));
	}

	function numberBox(value, type, placeholder, step) {
		const node = el('input');
		node.type = 'number';
		node.step = step;
		node.placeholder = placeholder;
		node.value = value === null || value === undefined ? '' : String(value);
		node.addEventListener('change', () => send({ type, value: node.value }));
		return node;
	}

	function chatGroup(state) {
		const c = state.chat;
		const support = c.controlsSupported
			? label('yana-rt supports these and Plan mode', 'ok')
			: label('This yana-rt is too old: Plan mode is only a request, these are ignored', 'warn');
		return group('Replies',
			row('Longest reply (tokens)', 'Empty uses the provider default (Claude: 4096). From 1 to 32000.', numberBox(c.maxTokens, 'setMaxTokens', 'default', '1')),
			row('Temperature', 'Empty uses the provider default. From 0 to 2; Claude caps it at 1.', numberBox(c.temperature, 'setTemperature', 'default', '0.1')),
			row('Plan mode', 'Switch it in the chat box. With a current yana-rt it cannot run commands or change files, only look and describe a plan.', support));
	}

	function plannedGroup(state) {
		const node = group('Not available yet');
		node.append(el('p', 'muted', 'These do not work yet, so there is no switch for them.'));
		for (const [name, why] of state.planned) node.append(row(name, why, label('Not available yet')));
		return node;
	}

	function render(state) {
		const page = el('main', 'page');
		page.append(el('h1', null, 'Yana IDE'),
			el('p', 'lead', 'Settings for the features of this IDE. Every switch here works; anything that does not work yet is listed at the bottom.'));
		if (notice) page.append(el('p', 'notice', notice));
		page.append(guideGroup(state), homeGroup(state), approvalGroup(state), assistantGroup(state), chatGroup(state), runtimeGroup(state), plannedGroup(state));
		app.replaceChildren(page);
	}

	let last;
	window.addEventListener('message', ({ data }) => {
		if (data?.type === 'state') { last = data.state; render(last); }
		if (data?.type === 'error') { notice = data.message; if (last) render(last); }
	});
	vscode.postMessage({ type: 'ready' });
})();

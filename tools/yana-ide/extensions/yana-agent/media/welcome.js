'use strict';
// Giao diện trang chủ Yana. Chỉ dựng DOM bằng textContent (không innerHTML); mọi nút gửi id lệnh cho extension.
(function () {
	const vscode = acquireVsCodeApi();
	const app = document.getElementById('app');

	function el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	}
	function run(id) { vscode.postMessage({ type: 'run', id }); }
	function action(label, id, cls) {
		const button = el('button', cls || 'btn', label);
		button.addEventListener('click', () => run(id));
		return button;
	}
	function card(title, note, id, primary) {
		const node = el('button', 'card' + (primary ? ' primary' : ''));
		node.append(el('span', 'card-title', title), el('span', 'card-note', note));
		node.addEventListener('click', () => run(id));
		return node;
	}
	function section(title, ...children) {
		const node = el('section', 'section');
		node.append(el('h2', null, title), ...children);
		return node;
	}
	function row(label, value, tone) {
		const node = el('div', 'row');
		node.append(el('span', 'row-label', label), el('span', 'row-value' + (tone ? ` ${tone}` : ''), value));
		return node;
	}

	function hero() {
		const node = el('header', 'hero');
		const logo = el('img', 'emblem');
		logo.src = document.body.dataset.emblem;
		logo.alt = '';
		const actions = el('div', 'hero-actions');
		actions.append(action('Open Folder', 'openFolder', 'btn primary'), action('Clone Repository', 'clone'), action('Open Recent…', 'recent'));
		node.append(logo, el('h1', null, 'Yana Studio'),
			el('p', 'tagline', 'Idea, design, code, run, track and ship in one place. Yana does the work; you approve every command.'), actions);
		return node;
	}

	function features() {
		const grid = el('div', 'grid');
		grid.append(
			card('Design Canvas', 'Describe a screen and watch the AI build it live, with any model', 'canvasNew', true),
			card('Chat with Yana', 'Ask or give a task in the right-hand panel. Commands wait for you', 'chat', true),
			card('Tasks board', 'Tasks with dependencies and evidence', 'tasks'),
			card('Permissions', 'Leases, grant authority, pending approvals', 'permissions'),
			card('Component editor', 'Hand-edit a design: 22 components, layers', 'canvasStudio'),
			card('Project Memory', 'Notes sent with every new conversation', 'memory'),
			card('User guide', 'Step-by-step manual: first setup, approvals, fixes', 'guide', true),
			card('Settings', 'Models, API keys, runtime, usage', 'settings'),
			card('Yana IDE settings', 'Guide, approvals, default assistant', 'idePreferences'),
			card('Yana Control Center', 'Live status: Giám Thị, guards, sandbox, hooks', 'controlCenter', true),
			card('All Yana tools', 'Open the Yana column on the left', 'sidebar'),
		);
		return section('Start here', grid);
	}

	function recent(status) {
		const list = el('div', 'list');
		if (!status.recent.length) list.append(el('p', 'muted', 'No recent folders yet. Open a folder to start.'));
		for (const entry of status.recent) {
			const item = el('button', 'recent');
			item.append(el('span', 'recent-name', entry.name), el('span', 'recent-path', entry.path));
			item.addEventListener('click', () => vscode.postMessage({ type: 'openFolder', path: entry.path }));
			list.append(item);
		}
		return section('Recent workspaces', list);
	}

	function health(status) {
		const box = el('div', 'list');
		box.append(row('Yana runtime', status.runtime.found ? `yana-rt ${status.runtime.version}` : 'not found', status.runtime.found ? 'ok' : 'bad'));
		const keyNote = status.model.keyed === null ? 'no key needed' : status.model.keyed ? 'key saved' : 'no key yet';
		box.append(row('Chat model', `${status.model.provider} · ${status.model.model} · ${keyNote}`, status.model.keyed === false ? 'bad' : ''));
		for (const entry of status.local) {
			box.append(row(entry.name, entry.ready ? `ready · ${entry.models} models` : 'not running', entry.ready ? 'ok' : 'muted'));
		}
		const buttons = el('div', 'inline');
		buttons.append(action('Choose model', 'pickModel'), action('Add API key', 'setKey'));
		box.append(buttons);
		return section('Runtime and local AI', box);
	}

	function policy() {
		const node = el('div', 'list');
		node.append(row('Allowed', 'reading files, scans, status checks'),
			row('Needs your approval', 'running any command'),
			el('p', 'muted', 'Anything Yana wants to run stops and asks you first.'));
		const buttons = el('div', 'inline');
		buttons.append(action('Run Doctor', 'doctor'), action('Scan agent setup', 'scan'), action('Hunt vulnerabilities', 'hunt'));
		node.append(buttons);
		return section('Safety policy', node);
	}

	function footer() {
		const label = el('label', 'startup');
		const box = el('input');
		box.type = 'checkbox';
		box.checked = true;
		box.addEventListener('change', () => vscode.postMessage({ type: 'showOnStartup', value: box.checked }));
		label.append(box, el('span', null, 'Show this page when no file is open at startup'));
		return label;
	}

	function render(status) {
		const columns = el('div', 'columns');
		const left = el('div', 'col');
		const right = el('div', 'col');
		left.append(features(), recent(status));
		right.append(health(status), policy());
		columns.append(left, right);
		app.replaceChildren(hero(), columns, footer());
	}

	window.addEventListener('message', ({ data }) => {
		if (data?.type === 'status') render(data.status);
	});
	app.replaceChildren(el('p', 'muted center', 'Loading…'));
	vscode.postMessage({ type: 'ready' });
})();

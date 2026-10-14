// Khung trang Yana Settings: tiêu đề, thanh tab, tải dữ liệu từng tab qua extension host.
// DOM chỉ dựng bằng textContent, không innerHTML. Renderer từng tab nằm trong settings-tabs.js.
(function () {
	const vscode = acquireVsCodeApi();
	const TABS = [
		['account', 'Account'], ['appearance', 'Appearance'], ['models', 'Models & Runtime'], ['usage', 'Usage'],
		['connections', 'Connections'], ['permissions', 'Permissions'], ['tools', 'External Tools'],
		['commands', 'Yana Commands'], ['data', 'Privacy & Data'],
	];
	const app = document.getElementById('app');
	const pending = new Map();
	let current = 'models';
	let requestSeq = 0;

	function el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined && text !== null) node.textContent = String(text);
		return node;
	}

	function button(label, cls, onClick) {
		const node = el('button', `btn ${cls || ''}`.trim(), label);
		node.type = 'button';
		node.addEventListener('click', async () => {
			node.disabled = true;
			try {
				await onClick();
			} finally {
				node.disabled = false;
			}
		});
		return node;
	}

	function badge(text, tone) {
		return el('span', `badge ${tone || ''}`.trim(), text);
	}

	function card(title, sub, extra) {
		const node = el('section', 'card');
		const head = el('div', 'card-head');
		const titles = el('div');
		titles.append(el('h3', '', title));
		if (sub) titles.append(el('p', 'sub', sub));
		head.append(titles);
		if (extra) head.append(extra);
		node.append(head);
		return node;
	}

	function notice(text, isError) {
		return el('div', isError ? 'notice error' : 'notice', text);
	}

	function number(value) {
		return new Intl.NumberFormat('en-US').format(value || 0);
	}

	function bytes(value) {
		if (!value) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
		return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value / 1024 ** index)} ${units[index]}`;
	}

	// Gửi hành động tới extension host và chờ kết quả (ok / error).
	function request(type, payload) {
		const requestId = ++requestSeq;
		vscode.postMessage({ type, requestId, ...payload });
		return new Promise(resolve => pending.set(requestId, resolve));
	}

	function load(tab) {
		vscode.postMessage({ type: 'load', tab });
	}

	const body = el('main', 'section');
	const tabBar = el('nav', 'tabs');
	tabBar.setAttribute('role', 'tablist');

	function renderShell() {
		const page = el('div', 'page');
		const header = el('header');
		header.append(el('div', 'eyebrow', 'Control plane'), el('h1', '', 'Yana Studio Settings'),
			el('p', 'sub', 'Appearance, models, runtime and connections in one place. Every value here is read from yana-rt and this machine.'));
		for (const [id, label] of TABS) {
			const tab = el('button', 'tab', label);
			tab.type = 'button';
			tab.dataset.tab = id;
			tab.setAttribute('role', 'tab');
			tab.addEventListener('click', () => select(id));
			tabBar.append(tab);
		}
		page.append(header, tabBar, body);
		app.append(page);
	}

	function select(tab) {
		current = TABS.some(([id]) => id === tab) ? tab : 'models';
		for (const node of tabBar.children) {
			const active = node.dataset.tab === current;
			node.classList.toggle('active', active);
			node.setAttribute('aria-selected', String(active));
		}
		body.replaceChildren(el('div', 'loading', 'Loading…'));
		load(current);
	}

	window.addEventListener('message', ({ data }) => {
		if (data?.type === 'select') select(data.tab);
		else if (data?.type === 'refresh') load(current);
		else if (data?.type === 'result') {
			pending.get(data.requestId)?.(data);
			pending.delete(data.requestId);
		} else if (data?.type === 'data' && (data.tab === current || data.tab === 'local')) {
			const renderer = window.YanaSettingsTabs[data.tab];
			if (data.payload?.error && data.tab !== 'local') {
				body.replaceChildren(notice(`Could not load data: ${data.payload.error}`, true));
				return;
			}
			if (data.tab === 'local') window.YanaSettingsTabs.renderLocal(data.payload);
			else body.replaceChildren(...[].concat(renderer(data.payload)));
		}
	});

	window.YanaUI = { el, button, badge, card, notice, number, bytes, request, load, select };
	renderShell();
	vscode.postMessage({ type: 'ready' });
})();

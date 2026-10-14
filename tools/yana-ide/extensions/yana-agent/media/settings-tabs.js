// Các tab còn lại của Yana Settings. Thiếu dữ liệu thật thì hiện trạng thái trống, không đặt số mẫu.
(function () {
	const { el, button, badge, card, notice, number, bytes, request } = window.YanaUI;
	const tabs = window.YanaSettingsTabs = window.YanaSettingsTabs || {};
	const YANA_THEMES = ['Yana Dark', 'Yana Light', 'Yana High Contrast', 'Yana High Contrast Light'];

	function item(title, detail, right) {
		const row = el('div', 'item');
		const text = el('div');
		text.append(el('div', '', title));
		if (detail) text.append(el('div', 'muted', detail));
		row.append(text);
		if (right) row.append(right);
		return row;
	}

	function list(rows) {
		const node = el('div', 'list');
		node.append(...rows);
		return node;
	}

	tabs.account = data => {
		const node = card('Account', 'Yana in the IDE needs no sign-in and has no cloud sync.');
		node.append(list([
			item('Provider API keys', 'Stored in the Keychain through the IDE SecretStorage, never in settings files.', button('Manage keys', '', () => window.YanaUI.select('models'))),
			item('Display language', `Current: ${data.language}`, button('Change language', '', () => request('pickLanguage', {}))),
			item('Local account from the old Studio app', 'The local email/password profile has not been ported to the IDE.', badge('Not ported')),
		]));
		return node;
	};

	tabs.appearance = data => {
		const usingYana = YANA_THEMES.includes(data.colorTheme);
		const node = card('Appearance', 'The theme controls the colors of the whole IDE, including the Yana panels.', badge(data.colorTheme || 'default', usingYana ? 'ok' : ''));
		node.append(list([
			item('Yana Dark', 'Cockpit palette: base #0c0e12, editor #12151c, accent #4f80ff.', button(data.colorTheme === 'Yana Dark' ? 'Active' : 'Use Yana Dark', 'primary', () => request('useYanaTheme', {}))),
			item('Yana Light, Yana High Contrast', 'Same palette for light mode and high contrast. Pick them in the theme picker.', button('Choose theme', '', () => request('pickTheme', {}))),
		]));
		return node;
	};

	function barRow(label, value, total) {
		const percent = total ? Math.round((value / total) * 100) : 0;
		const row = el('div', 'spread');
		const bar = el('div', 'bar');
		bar.style.flex = '1';
		const fill = el('span');
		fill.style.width = `${percent}%`;
		bar.append(fill);
		row.append(el('span', '', label), bar, el('span', 'mono', `${number(value)} · ${percent}%`));
		return row;
	}

	tabs.usage = data => {
		const node = card('Token usage', 'Tokens reported by the provider through yana-rt, recorded after each chat turn in the IDE. Not a provider quota or invoice.',
			button('Refresh', '', () => window.YanaUI.load('usage')));
		if (!data.all?.rounds) {
			node.append(el('div', 'empty', 'No chat turns recorded yet. Send a message in the Yana AI panel and its token count appears here.'),
				button('Open chat panel', 'primary', () => request('openChat', {})));
			return node;
		}
		const stats = el('div', 'grid2');
		for (const [label, total] of [['This workspace', data.workspace], ['All projects', data.all]]) {
			const box = el('div', 'box');
			box.append(el('div', 'muted', label), el('div', 'stat', number(total.total)), el('div', 'muted', `${number(total.rounds)} model turns recorded`));
			stats.append(box);
		}
		const models = list(data.models.map(m => item(m.model, `${m.provider} · ${number(m.rounds)} turns`, el('span', 'mono', number(m.total)))));
		node.append(stats, barRow('Input tokens', data.all.input, data.all.total), barRow('Output tokens', data.all.output, data.all.total), el('h3', '', 'By provider and model'), models);
		return node;
	};

	tabs.connections = () => {
		const node = card('Connections', 'OAuth connections from the old Studio app (GitHub, Slack, Notion, Google) have not been ported to the IDE.');
		node.append(el('div', 'empty', 'No connections in the IDE yet. This needs the OAuth flow and secure token storage rebuilt before it can be turned on.'));
		return node;
	};

	tabs.permissions = data => {
		const approvals = card('Pending approvals', 'From yana-rt authority pending-approvals. Approve or deny them in the chat panel.');
		approvals.append(data.approvalsError ? notice(data.approvalsError, true)
			: data.approvals.length ? list(data.approvals.map(a => item(a.capability || a.approval_id, a.reason || a.expires_at || '', badge('Pending', 'warn'))))
				: el('div', 'empty', 'Nothing is waiting for approval.'));
		const leases = card('Capability leases', 'Time-boxed authority granted through yana-rt lease. Revoking takes effect on the next authority check.');
		leases.append(data.leasesError ? notice(data.leasesError, true)
			: data.leases.length ? list(data.leases.map(l => item(l.capability || l.id, `${l.subject || ''} · expires ${l.expires_at || '?'}`, button('Revoke', 'danger', () => request('revokeLease', { id: l.id })))))
				: el('div', 'empty', 'No leases granted.'));
		return [approvals, leases];
	};

	tabs.tools = data => {
		const discord = card('Discord', 'Authenticated chat only. Repository, Git, process and tool capabilities are never exposed to Discord.',
			badge(data.runtime.discord ? 'Available in runtime' : 'Not in this runtime', data.runtime.discord ? 'ok' : ''));
		discord.append(list([
			item('Bot token', null, el('span', 'mono', data.discord.configured ? 'set (hidden)' : 'not set')),
			item('Allowed channels', null, el('span', 'mono', data.discord.channels)),
			item('Allowed users', null, el('span', 'mono', data.discord.users)),
		]));
		const mcp = card('MCP', 'MCP over stdio. Workspace changes stay governed and approval-only operations stay denied.',
			badge(data.runtime.mcp ? 'Available in runtime' : 'Not in this runtime', data.runtime.mcp ? 'ok' : ''));
		mcp.append(el('div', 'box mono', 'yana-rt mcp'));
		const external = card('Other AI tools on this machine', 'Found on PATH. They run in your own terminal; their output is never treated as Yana evidence.');
		const grid = el('div', 'grid3');
		grid.append(...data.externalTools.map(tool => {
			const box = el('div', 'box');
			box.append(el('div', '', tool.label), el('div', 'mono muted', tool.available ? tool.path : 'Not found'),
				tool.available ? button('Open in terminal', '', () => request('openToolTerminal', { command: tool.command })) : badge('Not installed'));
			return box;
		}));
		external.append(grid);
		return [discord, mcp, external];
	};

	tabs.commands = data => {
		const node = card('Yana commands', data.source ? `${data.commands.length} commands from COMMANDS.md` : data.error);
		if (!data.commands?.length) {
			node.append(el('div', 'empty', 'Open the Yana-AI folder (it contains COMMANDS.md) to see the command reference.'));
			return node;
		}
		const search = el('input');
		search.type = 'search';
		search.placeholder = 'Search commands…';
		const table = el('table');
		const head = el('tr');
		head.append(el('th', '', 'Command'), el('th', '', 'Description'), el('th', '', ''));
		table.append(head);
		const rows = data.commands.map(entry => {
			const row = el('tr');
			const actions = el('td');
			const buttons = el('div', 'row');
			buttons.append(button('Copy', '', () => request('copy', { text: entry.command })),
				button('Insert into terminal', '', () => request('fillTerminal', { command: entry.command })));
			actions.append(buttons);
			row.append(el('td', 'mono', entry.command), el('td', 'muted', `${entry.category} · ${entry.description}`), actions);
			row.dataset.search = `${entry.command} ${entry.category} ${entry.description}`.toLowerCase();
			return row;
		});
		table.append(...rows);
		search.addEventListener('input', () => {
			const query = search.value.trim().toLowerCase();
			for (const row of rows) row.hidden = Boolean(query) && !row.dataset.search.includes(query);
		});
		node.append(search, table);
		return node;
	};

	tabs.data = data => {
		const node = card('Privacy & Data', 'Counts files and sizes only. This page never reads file contents.');
		node.append(el('div', 'stat', bytes(data.project.bytes + data.extension.bytes)), list([
			item('Project state (.yana-ai/)', data.root || 'No folder open', el('span', 'mono', `${number(data.project.files)} files · ${bytes(data.project.bytes)}`)),
			item('Yana extension data in the IDE', 'Holds no API keys: keys live in the Keychain.', el('span', 'mono', `${number(data.extension.files)} files · ${bytes(data.extension.bytes)}`)),
			item('Project Memory sent with every chat turn', null, button(data.memoryBytes ? `${bytes(data.memoryBytes)} · Open` : 'Empty · Write', '', () => request('openMemory', {}))),
			item('Saved token records', null, el('span', 'mono', number(data.usageRecords))),
			item('Export / restore backup', 'Not ported from the old Studio app yet.', badge('Not available')),
		]));
		return node;
	};
})();

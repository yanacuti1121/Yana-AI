// Dựng thử view Status với một `vscode` giả: kiểm phần nối dây (đăng ký view, lệnh, nạp dữ liệu, huy hiệu,
// lỗi khi yana-rt cũ chưa có lệnh status) mà test mô hình thuần không thấy được.
// Dùng: node tests/status-view.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const path = require('node:path');
const Module = require('node:module');
const fs = require('node:fs');

const ext = process.argv[2] || path.resolve(__dirname, '../extensions/yana-agent');

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };

// --- vscode giả, đủ cho tree.js, changes.js và status.js ---
const registered = { views: {}, commands: {} };
class TreeItem { constructor(label, state) { this.label = label; this.collapsibleState = state; } }
class ThemeIcon { constructor(id) { this.id = id; } }
class EventEmitter { constructor() { this.l = new Set(); this.event = fn => { this.l.add(fn); return { dispose() {} }; }; } fire(d) { for (const fn of this.l) fn(d); } }
const fakeVscode = {
	TreeItem, ThemeIcon, EventEmitter,
	TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
	window: {
		createTreeView(id, options) {
			const view = { id, options, visible: false, badge: undefined, onDidChangeVisibility(fn) { view.fireVisible = fn; return { dispose() {} }; }, dispose() {} };
			registered.views[id] = view;
			return view;
		},
	},
	commands: { registerCommand(id, fn) { registered.commands[id] = fn; return { dispose() {} }; } },
	workspace: { onDidChangeConfiguration: () => ({ dispose() {} }), getConfiguration: () => ({ get: (_k, d) => d }), workspaceFolders: [], isTrusted: true },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'vscode' ? 'vscode' : origResolve.call(this, request, ...rest); };
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: fakeVscode };

// --- yana-rt giả: cli.js bị thay bằng một hàm runJson do test điều khiển ---
let reply = { schema: 1, state: 'idle', attention: [], engines: [], approvals: [], audit: [], halted: false, unavailable: [] };
const calls = [];
const cliPath = path.join(ext, 'cli.js');
require.cache[cliPath] = { id: cliPath, filename: cliPath, loaded: true, exports: { runJson: async args => { calls.push(args); if (reply instanceof Error) throw reply; return reply; }, run: async () => '', workspaceRoot: () => '', binary: () => '' } };

const status = require(path.join(ext, 'features/status.js'));
const context = { subscriptions: [] };
const api = status.activate(context);

check('the Status view and its refresh command are registered', !!registered.views['yana.status'] && typeof registered.commands['yana.status.refresh'] === 'function');
check('the feature is listed in the registry', fs.readFileSync(path.join(ext, 'features/index.js'), 'utf8').includes("require('./status')"));

const pkg = JSON.parse(fs.readFileSync(path.join(ext, 'package.json'), 'utf8'));
const viewIds = Object.values(pkg.contributes.views).flat().map(view => view.id);
check('package.json declares the view the code registers', viewIds.includes('yana.status'));
check('package.json declares the refresh command', pkg.contributes.commands.some(command => command.command === 'yana.status.refresh'));
check('the refresh button is on the Status view title', pkg.contributes.menus['view/title'].some(entry => entry.command === 'yana.status.refresh' && entry.when === 'view == yana.status'));

(async () => {
	const provider = registered.views['yana.status'].options.treeDataProvider;

	let items = await provider.getChildren();
	check('it asks the runtime for exactly "status --json"', calls.length === 1 && calls[0].join(' ') === 'status --json', JSON.stringify(calls));
	check('an idle snapshot shows one headline row', items.length === 1 && items[0].label === 'Nothing running', JSON.stringify(items.map(i => i.label)));
	check('no badge when nothing needs a person', registered.views['yana.status'].badge === undefined);

	reply = { schema: 1, state: 'ask', attention: ['approval_pending'], engines: [{ name: 'Claude Code', count: 2 }], approvals: [{ id: 'a', capability: 'run_command', reason: 'r', expires_at: new Date(Date.now() + 600000).toISOString() }], audit: [], halted: false, unavailable: [] };
	items = await provider.getChildren();
	const labels = items.map(i => i.label);
	check('a pending approval shows a headline, a group and the engines', labels.includes('Needs your decision') && labels.includes('Waiting for you') && labels.includes('Running'), JSON.stringify(labels));
	check('the badge counts what needs a person', registered.views['yana.status'].badge?.value === 1, JSON.stringify(registered.views['yana.status'].badge));
	const waitingGroup = items.find(i => i.label === 'Waiting for you');
	const children = await provider.getChildren(waitingGroup);
	check('the group expands to the capability', children[0].label === 'run_command');

	reply = new Error("yana-rt status --json: error: unrecognized subcommand 'status'");
	items = await provider.getChildren();
	check('an old yana-rt is explained, not shown as a raw error', items.length === 1 && items[0].label.includes('no "status" command'), JSON.stringify(items.map(i => i.label)));
	check('the badge is cleared on that failure', registered.views['yana.status'].badge === undefined);

	reply = new Error('disk on fire');
	items = await provider.getChildren();
	check('any other failure still reaches the tree error row', items.length === 1 && items[0].label.includes('disk on fire'), JSON.stringify(items.map(i => i.label)));

	check('refresh() on the returned API does not throw', (() => { try { api.refresh(); return true; } catch { return false; } })());
	check('every disposable is collected for cleanup', context.subscriptions.length >= 4, String(context.subscriptions.length));

	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });

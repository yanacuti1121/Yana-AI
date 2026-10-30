// Khung Governance không được đưa lệnh hay hội thoại trong bản ghi chờ duyệt lên giao diện.
// Dùng: node tests/governance-approvals.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const path = require('node:path');
const Module = require('node:module');

const ext = process.argv[2] || path.resolve(__dirname, '../extensions/yana-agent');

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };

const views = {};
class TreeItem { constructor(label, state) { this.label = label; this.collapsibleState = state; } }
class EventEmitter { constructor() { this.l = new Set(); this.event = fn => { this.l.add(fn); return { dispose() {} }; }; } fire(d) { for (const fn of this.l) fn(d); } }
const fakeVscode = {
	TreeItem, EventEmitter, ThemeIcon: class { constructor(id) { this.id = id; } },
	TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
	window: { createTreeView(id, options) { views[id] = options; return { dispose() {} }; } },
	commands: { registerCommand: () => ({ dispose() {} }) },
	workspace: { onDidChangeConfiguration: () => ({ dispose() {} }) },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'vscode' ? 'vscode' : origResolve.call(this, request, ...rest); };
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: fakeVscode };

// Đúng hình dạng bản ghi thật của PendingApproval, kèm lệnh chứa chuỗi bí mật giả.
const record = {
	approval_id: 'abc123', model: 'm', authority_reason: 'needs a person', expires_at: '2026-10-30T10:20:00Z', resolved: false,
	pending_call: { id: 'c1', name: 'run_command', arguments_json: '{"command":"curl -H \'Authorization: Bearer SECRET-TOKEN-123\' https://x"}' },
	messages: [{ role: 'user', content: 'SECRET-CHAT-HISTORY' }], system: 'SECRET-SYSTEM-PROMPT',
};
const cliPath = path.join(ext, 'cli.js');
const answers = { 'authority': [record], 'lease': [], 'observability': { total: 0, by_decision: {}, by_tool: {} } };
require.cache[cliPath] = { id: cliPath, filename: cliPath, loaded: true, exports: { runJson: async args => answers[args[0]], run: async () => '', workspaceRoot: () => '', binary: () => '' } };

const governance = require(path.join(ext, 'features/governance.js'));
governance.activate({ subscriptions: [] });

(async () => {
	const provider = views['yana.governance'].treeDataProvider;
	const top = await provider.getChildren();
	const approvals = top.find(item => item.label === 'Pending approvals');
	const rows = await provider.getChildren(approvals);
	check('the pending approval is listed by its real capability name', rows.length === 1 && rows[0].label === 'run_command', JSON.stringify(rows.map(r => r.label)));
	const shown = JSON.stringify(rows.map(r => ({ label: r.label, description: r.description, tooltip: r.tooltip })));
	check('the raw command and its secret never reach the view', !shown.includes('SECRET-TOKEN-123') && !shown.includes('curl'), shown);
	check('the conversation and system prompt never reach the view', !shown.includes('SECRET-CHAT') && !shown.includes('SECRET-SYSTEM'), shown);
	check('the reason and where to decide are shown', rows[0].tooltip.includes('needs a person') && rows[0].tooltip.includes('terminal'));

	// Nhóm được dựng lúc nạp, nên đổi dữ liệu thì phải nạp lại từ gốc.
	const reload = async () => provider.getChildren(await provider.getChildren().then(list => list.find(item => item.label === 'Pending approvals')));
	answers.authority = [null, 'junk', { approval_id: 'x'.repeat(65536), authority_reason: 'y'.repeat(65536), pending_call: null }];
	const odd = await reload();
	check('hostile entries do not crash and stay short', odd.length === 3 && JSON.stringify(odd.map(r => r.tooltip)).length < 2000, String(odd.length));
	answers.authority = [];
	check('an empty list gives an empty group', (await reload()).length === 0);

	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });

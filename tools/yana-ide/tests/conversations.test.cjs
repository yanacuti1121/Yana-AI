// Kiểm tra lịch sử hội thoại (features/conversations.js) với vscode giả, gồm cả việc "tắt rồi mở lại app":
// module được nạp lại từ đầu nhưng dùng cùng kho workspaceState, như khi VS Code khởi động lại cùng workspace.
// Dùng: node tests/conversations.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const Module = require('node:module');
const path = require('node:path');

const ext = process.argv[2];
const storage = new Map(); // workspaceState bền qua các lần "khởi động"
const registered = {};
const shown = {};
let provider;
let pickerChoice;
const executed = [];

class EventEmitter {
	constructor() { this.listeners = []; }
	get event() { return callback => { this.listeners.push(callback); return { dispose() {} }; }; }
	fire(value) { this.listeners.forEach(callback => callback(value)); }
	dispose() {}
}
const fakeVscode = {
	EventEmitter,
	TreeItem: class { constructor(label) { this.label = label; } },
	TreeItemCollapsibleState: { None: 0, Expanded: 2 },
	ThemeIcon: class { constructor(id) { this.id = id; } },
	QuickPickItemKind: { Separator: -1 },
	window: {
		createTreeView: (_id, options) => { provider = options.treeDataProvider; return { dispose() {} }; },
		showQuickPick: async (items, options) => { shown.items = items; shown.placeHolder = options.placeHolder; return pickerChoice(items); },
		showInputBox: async () => 'Renamed by test',
		showWarningMessage: async () => 'Delete',
	},
	commands: {
		registerCommand: (id, handler) => { registered[id] = handler; return { dispose() {} }; },
		executeCommand: async (id, ...args) => { executed.push([id, ...args]); },
	},
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'vscode' ? 'vscode' : origResolve.call(this, request, ...rest); };
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: fakeVscode };

// "Khởi động" extension: nạp lại module từ đầu, giữ nguyên kho lưu.
function boot() {
	for (const key of Object.keys(require.cache)) {
		if (key.includes(`${path.sep}yana-agent${path.sep}features${path.sep}`)) delete require.cache[key];
	}
	const conversations = require(path.join(ext, 'features/conversations.js'));
	const context = {
		workspaceState: { get: (key, fallback) => (storage.has(key) ? storage.get(key) : fallback), update: async (key, value) => { storage.set(key, structuredClone(value)); } },
		subscriptions: [],
	};
	conversations.activate(context);
	return conversations;
}

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };

(async () => {
	let c = boot();
	check('fresh start has no active conversation', c.active() === undefined);
	const labels = async () => (await provider.getChildren()).map(item => item.label);
	check('empty list shows the empty hint', (await labels())[0].startsWith('No conversations yet'));

	const first = await c.ensureActive(() => 'memory snapshot');
	check('ensureActive creates one with the memory snapshot', first.system === 'memory snapshot' && c.active().id === first.id);
	await c.appendTurn(first.id, '  How do I   run the tests?  ', 'Use cargo test.');
	check('turn saved as user+assistant', c.active().messages.length === 2 && c.active().messages[1].content === 'Use cargo test.');
	check('title comes from the first message, whitespace collapsed', c.active().title === 'How do I run the tests?');
	await c.appendTurn(first.id, 'And lint?', 'Use clippy.');
	check('title stays after the second turn', c.active().title === 'How do I run the tests?' && c.active().messages.length === 4);

	const second = await c.create('another snapshot');
	await new Promise(resolve => setTimeout(resolve, 5));
	await c.appendTurn(second.id, 'Second chat question', 'Second answer');
	check('second conversation becomes active', c.active().id === second.id);

	// Tắt rồi mở lại app
	c = boot();
	check('after restart the same conversation is active', c.active()?.id === second.id);
	const stored = storage.get('yana.conversations.v1');
	check('after restart both conversations are still stored', stored.list.length === 2);
	const old = stored.list.find(entry => entry.id === first.id);
	check('after restart old messages and system snapshot are intact', old.messages.length === 4 && old.system === 'memory snapshot');
	check('list shows newest first with turn counts', (await provider.getChildren())[0].description.startsWith('1 turns') || (await provider.getChildren())[0].description.startsWith('1 turn'));

	// Mở lại hội thoại cũ qua lệnh "Open a past conversation…"
	pickerChoice = items => items.find(item => item.id === first.id);
	await registered['yana.chat.history']();
	check('history picker lists both', shown.items.length === 2 && shown.placeHolder === 'Open a conversation');
	check('picking an old conversation makes it active and focuses chat', c.active().id === first.id && executed.some(entry => entry[0] === 'yana.focus'));
	check('history sent to the model is the old turns', c.active().messages.slice(-40).length === 4);

	// Đổi tên và xoá
	await registered['yana.chat.rename']({ conversationId: first.id });
	check('rename works', c.active().title === 'Renamed by test');
	await registered['yana.chat.delete']({ conversationId: first.id });
	check('delete removes it and clears the active id', storage.get('yana.conversations.v1').list.length === 1 && c.active() === undefined);
	c = boot();
	check('delete survives a restart', storage.get('yana.conversations.v1').list.length === 1);

	// Giới hạn
	const big = await c.create('');
	await c.appendTurn(big.id, 'x'.repeat(70000), 'y'.repeat(70000));
	const capped = storage.get('yana.conversations.v1').list.find(entry => entry.id === big.id).messages;
	check('oversized messages are capped at 64KB', capped[0].content.length === 65536 && capped[1].content.length === 65536);
	for (let i = 0; i < 210; i++) await c.appendTurn(big.id, `q${i}`, `a${i}`);
	const trimmed = storage.get('yana.conversations.v1').list.find(entry => entry.id === big.id).messages;
	check('messages per conversation capped at 400, newest kept', trimmed.length === 400 && trimmed[399].content === 'a209');
	for (let i = 0; i < 105; i++) await c.create('');
	check('conversations capped at 100', storage.get('yana.conversations.v1').list.length === 100);
	await c.appendTurn('does-not-exist', 'q', 'a');
	check('turn for an unknown id changes nothing', storage.get('yana.conversations.v1').list.length === 100);
	console.log(`${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();

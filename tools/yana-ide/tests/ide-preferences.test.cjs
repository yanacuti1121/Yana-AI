// Kiểm tra màn "Yana IDE" (features/ide-preferences.js) với vscode giả: trạng thái trả về đúng, mỗi công tắc ghi đúng
// cấu hình, hành động lạ hoặc tham số xấu bị từ chối, và sách hướng dẫn tôn trọng công tắc tự mở.
// Dùng: node tests/ide-preferences.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ext = process.argv[2];
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-prefs-'));
const config = new Map([['welcome.showOnStartup', true]]);
const registered = {};
const executed = [];
const posted = [];
let trusted = true;
let warningAnswer = 'Turn on';
let listener;
let receive;

const fakeVscode = {
	EventEmitter: class { constructor() { this.l = []; } get event() { return cb => { this.l.push(cb); return { dispose() {} }; }; } fire(v) { this.l.forEach(cb => cb(v)); } dispose() {} },
	ConfigurationTarget: { Global: 1 },
	ViewColumn: { Active: -1 },
	Uri: { joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath || '', ...parts), toString: () => path.join(base.fsPath || '', ...parts) }) },
	workspace: {
		get isTrusted() { return trusted; },
		workspaceFolders: [{ uri: { fsPath: root } }],
		getConfiguration: () => ({
			get: (key, fallback) => (config.has(key) ? config.get(key) : fallback),
			update: async (key, value) => { config.set(key, value); },
		}),
		onDidChangeConfiguration: () => ({ dispose() {} }),
	},
	window: {
		showWarningMessage: async () => warningAnswer,
		createWebviewPanel: () => ({
			iconPath: null,
			webview: {
				cspSource: 'csp', asWebviewUri: uri => uri,
				postMessage: message => { posted.push(message); },
				onDidReceiveMessage: cb => { receive = cb; return { dispose() {} }; },
			},
			reveal() {}, onDidDispose() {}, dispose() {},
		}),
	},
	commands: {
		registerCommand: (id, handler) => { registered[id] = handler; return { dispose() {} }; },
		executeCommand: async (id, ...args) => {
			executed.push([id, ...args]);
			if (id === 'yana.assistants.get') return { items: [{ id: 'a1', name: 'One', provider: 'ollama', model: 'm' }, { id: 'a2', name: 'Two', provider: 'openai', model: 'g' }], selectedId: 'a1' };
			return undefined;
		},
	},
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'vscode' ? 'vscode' : origResolve.call(this, request, ...rest); };
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: fakeVscode };

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };
const lastState = () => [...posted].reverse().find(message => message.type === 'state')?.state;
const lastError = () => [...posted].reverse().find(message => message.type === 'error')?.message;
const send = async message => { posted.length = 0; await receive(message); };

(async () => {
	const prefs = require(path.join(ext, 'features/ide-preferences.js'));
	const guide = require(path.join(ext, 'features/guide.js'));
	const store = new Map();
	const context = {
		extensionUri: { fsPath: ext },
		subscriptions: [],
		globalState: { get: (key, fallback) => (store.has(key) ? store.get(key) : fallback), update: async (key, value) => { store.set(key, value); } },
	};
	prefs.activate(context);
	check('command yana.idePreferences.open is registered', typeof registered['yana.idePreferences.open'] === 'function');
	await registered['yana.idePreferences.open']();
	await send({ type: 'ready' });

	let state = lastState();
	check('state reports the guide switch on by default', state.guide.autoOpen === true && state.guide.seen === false);
	check('state lists the assistants with the selected id', state.assistants.items.length === 2 && state.assistants.selectedId === 'a1');
	check('state says approvals are off for a fresh folder', state.approvals.hasFolder && state.approvals.active === false);
	check('not-available list names voice and Discord', state.planned.some(([name]) => /Voice/.test(name)) && state.planned.some(([name]) => /Discord/.test(name)));

	await send({ type: 'setGuideAutoOpen', value: false });
	check('guide switch off is written and echoed back', config.get('guide.autoOpen') === false && lastState().guide.autoOpen === false);
	await send({ type: 'setGuideAutoOpen', value: 'yes' });
	check('a non-boolean value is treated as off, never truthy', config.get('guide.autoOpen') === false);
	await send({ type: 'setHomeOnStartup', value: false });
	check('start page switch is written', config.get('welcome.showOnStartup') === false);

	await store.set(guide.SEEN_KEY, true);
	await send({ type: 'showGuideAgain' });
	check('show guide again clears the seen flag', store.get(guide.SEEN_KEY) === false);

	await send({ type: 'selectAssistant', id: 'a2' });
	check('selecting a known assistant goes through yana.assistants.select', executed.some(call => call[0] === 'yana.assistants.select' && call[1] === 'a2'));
	executed.length = 0;
	await send({ type: 'selectAssistant', id: 'nope' });
	check('an unknown assistant is rejected and nothing is selected', lastError() === 'Unknown assistant' && !executed.some(call => call[0] === 'yana.assistants.select'));

	const marker = path.join(root, '.claude', 'state', 'locking-protocol-version');
	trusted = false;
	await send({ type: 'enableApprovals' });
	check('approvals refuse to turn on in Restricted Mode', /Restricted Mode/.test(lastError() || '') && !fs.existsSync(marker));
	trusted = true;
	warningAnswer = undefined;
	await send({ type: 'enableApprovals' });
	check('declining the confirmation writes nothing', !fs.existsSync(marker));
	warningAnswer = 'Turn on';
	await send({ type: 'enableApprovals' });
	check('confirming writes exactly the marker file', fs.readFileSync(marker, 'utf8').trim() === 'flock-v1' && lastState().approvals.active === true);

	posted.length = 0;
	await receive({ type: 'writeFile', path: '/etc/passwd' });
	check('an unknown action does nothing', posted.length === 0);

	fs.rmSync(root, { recursive: true, force: true });
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();

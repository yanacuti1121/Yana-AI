// Checks the Office tools screen (features/office.js) with a fake vscode: tool detection is honest, the command is
// registered and declared, the panel answers 'ready' with the tool list, the page has a strict CSP, and the webview
// script never uses innerHTML. Nothing here installs or runs any office tool.
// Usage: node tests/office.test.cjs <absolute path to extensions/yana-agent>
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const ext = process.argv[2] || path.resolve(__dirname, "../extensions/yana-agent");
const registered = {};
const posted = [];
let receive;
let panelCount = 0;
let saveAnswer; // what the fake save dialog returns; undefined means the user cancelled

const fakeVscode = {
	ViewColumn: { Active: -1 },
	Uri: { joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath || '', ...parts), toString: () => path.join(base.fsPath || '', ...parts) }) },
	commands: { registerCommand: (id, fn) => { registered[id] = fn; return { dispose() {} }; } },
	window: {
		showSaveDialog: async () => saveAnswer,
		createWebviewPanel: () => {
			panelCount++;
			return {
				webview: {
					cspSource: 'vscode-resource:',
					asWebviewUri: uri => uri,
					set html(value) { this._html = value; },
					get html() { return this._html; },
					onDidReceiveMessage: cb => { receive = cb; },
					postMessage: message => { posted.push(message); },
				},
				reveal() {},
				onDidDispose() {},
			};
		},
	},
};

const originalLoad = Module._load;
Module._load = function (request, ...rest) { return request === 'vscode' ? fakeVscode : originalLoad.call(this, request, ...rest); };
const office = require(path.join(ext, 'features', 'office.js'));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };

// Detection: nothing present
const none = office.toolStatus(ext, () => false);
check('four tools are listed', none.length === 4, String(none.length));
check('missing tools say "Not available yet"', none.every(tool => !tool.available && tool.note === 'Not available yet'));
// Detection: only the npm-style ones present
const some = office.toolStatus(ext, target => target.includes('node_modules'));
check('installed tools are reported as installed', some.filter(tool => tool.available).map(tool => tool.id).sort().join() === 'documents,marp,pptx');
check('typst stays unavailable when its binary is absent', some.find(tool => tool.id === 'typst').available === false);
// Detection never claims a tool from an empty probe
check('empty probe never marks anything available', office.toolStatus(ext, () => undefined).every(tool => tool.available === false));

// Activation and panel
const subscriptions = [];
office.activate({ subscriptions, extensionUri: { fsPath: ext }, extensionPath: ext });
check('command yana.office.open is registered', typeof registered['yana.office.open'] === 'function');
registered['yana.office.open']();
registered['yana.office.open']();
check('a second open reuses the panel', panelCount === 1, String(panelCount));
receive({ type: 'noise' });
check('unknown message gets no reply', posted.length === 0);
receive({ type: 'ready' });
check('ready is answered with the tool list', posted.length === 1 && posted[0].type === 'status' && posted[0].tools.length === 4);

// Preview and export messages (async handlers: wait a tick for each reply)
const lastReply = async (message) => { posted.length = 0; await receive(message); await new Promise(resolve => setTimeout(resolve, 20)); return posted[posted.length - 1]; };
(async () => {
	const good = await lastReply({ type: 'preview', markdown: '# A\n\n---\n\n# B\n' });
	check('preview message returns html and css', good?.type === 'preview' && good.html.includes('<section') && good.css.length > 100, JSON.stringify(good)?.slice(0, 120));
	const empty = await lastReply({ type: 'preview', markdown: '' });
	check('empty preview returns an error, not a crash', empty?.type === 'error', JSON.stringify(empty));
	const badFormat = await lastReply({ type: 'export', markdown: '# A', format: 'exe' });
	check('unsupported export format returns an error', badFormat?.type === 'error', JSON.stringify(badFormat));
	const emptyExport = await lastReply({ type: 'export', markdown: '', format: 'pdf' });
	check('export of empty text returns an error before any dialog', emptyExport?.type === 'error', JSON.stringify(emptyExport));
	saveAnswer = undefined;
	const cancelled = await lastReply({ type: 'export', markdown: '# A', format: 'pdf' });
	check('cancelling the save dialog exports nothing', cancelled?.type === 'exported' && cancelled.cancelled === true, JSON.stringify(cancelled));
	const pptxOut = path.join(require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'yana-office-')), 'deck.pptx');
	saveAnswer = { fsPath: pptxOut };
	posted.length = 0;
	await receive({ type: 'export', markdown: '# One\n\n- a\n\n---\n\n# Two\n', format: 'pptx-edit' });
	const kinds = posted.map(item => item.type).join();
	check('editable pptx export goes busy then exported', kinds === 'busy,exported', kinds);
	check('editable pptx export wrote the file the user chose', fs.existsSync(pptxOut) && fs.statSync(pptxOut).size > 1000);
	check('missing message type is ignored', (await lastReply({})) === undefined);
	finish();
})();

function finish() {

// Page and manifest
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'package.json'), 'utf8'));
check('command is declared in package.json', manifest.contributes.commands.some(command => command.command === 'yana.office.open'));
const index = fs.readFileSync(path.join(ext, 'features', 'index.js'), 'utf8');
check('feature is listed in features/index.js', index.includes("require('./office')"));
const source = fs.readFileSync(path.join(ext, 'features', 'office.js'), 'utf8');
check('CSP forbids everything except nonce scripts and local styles', source.includes("default-src 'none'") && source.includes("script-src 'nonce-"));
const client = fs.readFileSync(path.join(ext, 'media', 'office.js'), 'utf8');
const clientCode = client.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
check('webview script does not use innerHTML', !clientCode.includes('innerHTML'));
const css = fs.readFileSync(path.join(ext, 'media', 'office.css'), 'utf8');
check('stylesheet has no raw hex colors', !/#[0-9a-fA-F]{3,8}\b/.test(css));
for (const file of [source, client, css]) check('no em dash in file', !file.includes('—'));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}

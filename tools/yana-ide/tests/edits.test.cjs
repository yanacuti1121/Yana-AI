// Kiểm tra đề xuất sửa file trong chat (features/edit-protocol.js và features/edits.js) với vscode giả ghi file thật
// trong một thư mục tạm. Dùng: node tests/edits.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ext = process.argv[2] || path.resolve(__dirname, "../extensions/yana-agent");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'yana-edits-')));
const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'yana-outside-')));
let trusted = true;
const dirty = new Set();
const executed = [];

class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range { constructor(start, end) { this.start = start; this.end = end; } }
class WorkspaceEdit {
	constructor() { this.ops = []; }
	createFile(uri) { this.ops.push({ kind: 'create', uri }); }
	insert(uri, position, text) { this.ops.push({ kind: 'insert', uri, text }); }
	replace(uri, range, text) { this.ops.push({ kind: 'replace', uri, text }); }
}
const fakeVscode = {
	Position, Range, WorkspaceEdit,
	Uri: { file: fsPath => ({ fsPath, scheme: 'file', toString: () => `file://${fsPath}` }), from: parts => ({ ...parts, toString: () => `${parts.scheme}:${parts.path}?${parts.query}` }) },
	workspace: {
		get isTrusted() { return trusted; },
		get textDocuments() { return [...dirty].map(file => ({ uri: { fsPath: file }, isDirty: true, getText: () => fs.readFileSync(file, 'utf8') })); },
		openTextDocument: async uri => ({ uri, positionAt: offset => offset, getText: () => fs.readFileSync(uri.fsPath, 'utf8'), save: async () => true }),
		applyEdit: async edit => {
			for (const op of edit.ops) {
				if (op.kind === 'create') { fs.mkdirSync(path.dirname(op.uri.fsPath), { recursive: true }); fs.writeFileSync(op.uri.fsPath, ''); }
				else fs.writeFileSync(op.uri.fsPath, op.text);
			}
			return true;
		},
		registerTextDocumentContentProvider: () => ({ dispose() {} }),
	},
	window: { createOutputChannel: () => ({ info() {}, dispose() {} }) },
	commands: { executeCommand: async (...args) => { executed.push(args); } },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'vscode' ? 'vscode' : origResolve.call(this, request, ...rest); };
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: fakeVscode };

const protocol = require(path.join(ext, 'features/edit-protocol.js'));
const edits = require(path.join(ext, 'features/edits.js'));
edits.activate({ subscriptions: [] });

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };
const fence = (rel, body) => `Here is the change.\n\`\`\`yana-edit path=${rel}\n${body}\n\`\`\`\nDone.`;
const block = (search, replace) => `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;

(async () => {
	fs.writeFileSync(path.join(root, 'app.js'), 'const a = 1;\nconst b = 2;\nconsole.log(a + b);\n');
	fs.writeFileSync(path.join(root, 'dup.js'), 'x\nx\n');

	// Phân tích
	const parsed = protocol.parseEdits(fence('app.js', block('const b = 2;', 'const b = 3;')));
	check('parses one file with one block', parsed.length === 1 && parsed[0].path === 'app.js' && parsed[0].blocks[0].replace === 'const b = 3;');
	check('ignores text without a yana-edit fence', protocol.parseEdits('```js\nconsole.log(1)\n```').length === 0);
	check('merges several fences for the same path', protocol.parseEdits(fence('a.js', block('1', '2')) + fence('a.js', block('3', '4')))[0].blocks.length === 2);
	check('caps the number of files at 20', protocol.parseEdits(Array.from({ length: 30 }, (_, i) => fence(`f${i}.js`, block('a', 'b'))).join('\n')).length === 20);
	check('empty SEARCH parses for a new file', protocol.parseEdits(fence('new.js', block('', 'hello')))[0].blocks[0].search === '');

	// Đường dẫn nguy hiểm
	for (const bad of ['../etc/passwd', '/etc/passwd', 'a/../../x', '.env', 'config/.env.production', 'key.pem', '.git/config', '.claude/settings.json', 'core/rules/x.md', 'C:\\Windows\\x', 'a\\b', 'node_modules/x/index.js']) {
		check(`rejects path ${bad}`, protocol.checkRelativePath(bad) !== '');
	}
	check('accepts a normal nested path', protocol.checkRelativePath('src/lib/util.ts') === '');
	fs.symlinkSync(outside, path.join(root, 'escape'));
	check('rejects a symlinked directory that leaves the project', protocol.resolveInside(root, 'escape/file.txt').error !== undefined);

	// Áp dụng thử
	check('exact unique match applies', protocol.applyBlocks('a\nb\n', [{ search: 'b', replace: 'c' }]).content === 'a\nc\n');
	check('missing SEARCH reports not found', /not found/.test(protocol.applyBlocks('a', [{ search: 'zz', replace: 'y' }]).error));
	check('duplicated SEARCH is refused as ambiguous', /2 times/.test(protocol.applyBlocks('x\nx\n', [{ search: 'x', replace: 'y' }]).error));
	check('empty SEARCH on an existing file is refused', protocol.applyBlocks('a', [{ search: '', replace: 'y' }]).error !== undefined);
	check('replacement text containing $& is inserted literally', protocol.applyBlocks('a', [{ search: 'a', replace: '$&$&' }]).content === '$&$&');

	// Đề xuất và ghi file
	const items = edits.propose(fence('app.js', block('const b = 2;', 'const b = 3;')), root);
	check('proposal is ready with counts and diff lines', items.length === 1 && items[0].ok && items[0].additions === 1 && items[0].deletions === 1 && items[0].lines[0] === '-const b = 2;');
	check('proposing does not write anything', fs.readFileSync(path.join(root, 'app.js'), 'utf8').includes('const b = 2;'));
	await edits.preview(items[0].id);
	check('review opens the IDE diff editor', executed.some(call => call[0] === 'vscode.diff' && /Yana edit: app.js/.test(call[3])));
	const applied = await edits.apply(items[0].id);
	check('apply writes the new content', applied.ok && fs.readFileSync(path.join(root, 'app.js'), 'utf8') === 'const a = 1;\nconst b = 3;\nconsole.log(a + b);\n');
	check('a proposal cannot be applied twice', (await edits.apply(items[0].id)).ok === false);

	const created = edits.propose(fence('docs/new.md', block('', '# Hi')), root);
	check('new file proposal is marked new', created[0].ok && created[0].isNew);
	check('apply creates the file inside the project', (await edits.apply(created[0].id)).ok && fs.readFileSync(path.join(root, 'docs/new.md'), 'utf8') === '# Hi');
	const again = edits.propose(fence('docs/new.md', block('', 'x')), root);
	check('creating a file that exists is refused at proposal time', again[0].ok === false);

	const secret = edits.propose(fence('.env', block('', 'KEY=1')), root);
	check('secret file proposal is shown but not applicable', secret[0].ok === false && /protected/.test(secret[0].error) && (await edits.apply(secret[0].id)).ok === false);
	check('traversal proposal is not applicable', edits.propose(fence('../x.js', block('', 'x')), root)[0].ok === false);
	check('ambiguous proposal is not applicable', edits.propose(fence('dup.js', block('x', 'y')), root)[0].ok === false);

	// Chặn lúc áp dụng
	const drift = edits.propose(fence('app.js', block('const a = 1;', 'const a = 9;')), root);
	fs.writeFileSync(path.join(root, 'app.js'), 'changed elsewhere\n');
	check('apply refuses when the file changed after the proposal', /changed since/.test((await edits.apply(drift[0].id)).error));
	fs.writeFileSync(path.join(root, 'app.js'), 'const a = 1;\n');
	const unsaved = edits.propose(fence('app.js', block('const a = 1;', 'const a = 2;')), root);
	dirty.add(path.join(root, 'app.js'));
	check('apply refuses a file with unsaved editor changes', /unsaved/.test((await edits.apply(unsaved[0].id)).error));
	dirty.clear();
	const untrusted = edits.propose(fence('app.js', block('const a = 1;', 'const a = 5;')), root);
	trusted = false;
	check('apply refuses in an untrusted folder', /Trust/.test((await edits.apply(untrusted[0].id)).error));
	trusted = true;
	const rejected = edits.propose(fence('app.js', block('const a = 1;', 'const a = 6;')), root);
	edits.reject(rejected[0].id);
	check('a rejected proposal cannot be applied', (await edits.apply(rejected[0].id)).ok === false && fs.readFileSync(path.join(root, 'app.js'), 'utf8') === 'const a = 1;\n');
	check('the instructions tell the model it cannot write files', /cannot write files yourself/.test(protocol.EDIT_INSTRUCTIONS));

	console.log(`${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();

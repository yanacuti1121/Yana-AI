// Chạy studio-governance-bridge.js với yana-rt thật trong một dự án tạm (vscode giả).
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ext = process.argv[2];
const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'yana-gov-')));
fs.mkdirSync(path.join(project, '.claude/state'), { recursive: true });
fs.writeFileSync(path.join(project, '.claude/state/locking-protocol-version'), 'flock-v1\n');

let trusted = true;
const fakeVscode = {
	EventEmitter: class {
		constructor() { this.listeners = []; }
		get event() { return callback => { this.listeners.push(callback); return { dispose() {} }; }; }
		fire(value) { this.listeners.forEach(callback => callback(value)); }
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: project } }],
		get isTrusted() { return trusted; },
		getConfiguration: () => ({ get: (k, d) => d }),
	},
	window: {},
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'vscode' ? 'vscode' : origResolve.call(this, request, ...rest); };
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: fakeVscode };

const { HANDLERS: H } = require(path.join(ext, 'features/studio-governance-bridge.js'));
let pass = 0; let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };
const rejects = async (name, work, pattern) => { try { await work(); check(name, false, 'no error'); } catch (e) { check(name, pattern.test(e.message), e.message.slice(0, 120)); } };

(async () => {
	check('taskList empty', (await H.taskList(null, project)).length === 0);
	await H.taskCreate(null, project, 'First task', 'src/');
	await H.taskCreate(null, project, 'Second task');
	let list = await H.taskList(null, project);
	check('two tasks created', list.length === 2, JSON.stringify(list).slice(0, 200));
	const [a, b] = list;
	await H.taskDepend(null, project, b.id, a.id, 'blocks');
	list = await H.taskList(null, project);
	check('dependency recorded', JSON.stringify(list).includes(a.id));
	await rejects('depend rejects bad type', () => H.taskDepend(null, project, b.id, a.id, 'nonsense'), /Dependency type/);
	await rejects('done requires evidence', () => H.taskDone(null, project, a.id, '  '), /Evidence is required/);
	await H.taskDone(null, project, a.id, 'verified by test run');
	list = await H.taskList(null, project);
	check('task marked done', list.some(t => t.id === a.id && /done/i.test(t.status)), JSON.stringify(list).slice(0, 300));
	await H.taskDrop(null, project, b.id);
	await rejects('create rejects empty name', () => H.taskCreate(null, project, '   '), /Task name is required/);
	await rejects('foreign root rejected', () => H.taskList(null, '/etc'), /not the folder open/);
	await rejects('traversal root rejected', () => H.taskList(null, `${project}/..`), /not the folder open/);
	check('leaseList empty', (await H.leaseList(null, project)).length === 0);
	await H.leaseGrant(null, project, { subject: 'agent:test', capability: 'command.execute', expiresInMinutes: 5, allow: ['ls'], invocationBudget: 3 });
	const leases = await H.leaseList(null, project);
	check('lease granted', leases.length === 1, JSON.stringify(leases).slice(0, 200));
	await rejects('grant needs subject', () => H.leaseGrant(null, project, { capability: 'x' }), /Enter a subject/);
	await H.leaseRevoke(null, project, leases[0].id);
	const after = await H.leaseList(null, project);
	check('lease revoked', after.length === 0 || after.every(l => l.revoked || l.revoked_at || /revok/i.test(JSON.stringify(l))), JSON.stringify(after).slice(0, 200));
	check('pendingApprovals empty', (await H.pendingApprovals(null, project)).length === 0);
	trusted = false;
	await rejects('untrusted folder rejected', () => H.taskList(null, project), /Trust this folder/);
	console.log(`${pass} passed, ${fail} failed`);
	fs.rmSync(project, { recursive: true, force: true });
	process.exit(fail ? 1 : 0);
})();

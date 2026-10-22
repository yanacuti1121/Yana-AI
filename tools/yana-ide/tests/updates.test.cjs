'use strict';
// Kiểm tra features/updates.js: logic tách biệt Yana Studio và yana-rt, semver, thông báo
const Module = require('node:module');
const path = require('node:path');

const ext = path.resolve(process.cwd(), process.argv[2] || path.join(__dirname, '../extensions/yana-agent'));

const mockCommands = new Map();
const fakeVscode = {
	commands: {
		registerCommand(id, handler) {
			mockCommands.set(id, handler);
			return { dispose: () => mockCommands.delete(id) };
		},
		async executeCommand(id, ...args) {
			const handler = mockCommands.get(id);
			if (handler) return handler(...args);
			return undefined;
		}
	},
	workspace: {
		getConfiguration() {
			return {
				get: (k, d) => d,
				update: async () => {}
			};
		}
	},
	window: {
		showInformationMessage: () => Promise.resolve(),
		showErrorMessage: () => Promise.resolve(),
		setStatusBarMessage: () => {},
		withProgress: (opts, task) => task({ report: () => {} })
	},
	Uri: { parse: str => ({ str }) },
	env: { openExternal: () => {} }
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
	if (request === 'vscode') return 'vscode';
	return origResolve.call(this, request, ...rest);
};
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: fakeVscode };

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
	if (ok) {
		pass++;
		console.log('PASS', name);
	} else {
		fail++;
		console.log('FAIL', name, extra);
	}
};

const updates = require(path.join(ext, 'features/updates.js'));

// 1. Kiểm tra semver parsing
check('parseSemver parses clean version', JSON.stringify(updates.parseSemver('1.6.2')) === JSON.stringify([1, 6, 2]));
check('parseSemver parses prefix v', JSON.stringify(updates.parseSemver('v1.5.0')) === JSON.stringify([1, 5, 0]));
check('parseSemver parses studio-v tag', JSON.stringify(updates.parseSemver('studio-v1.6.2')) === JSON.stringify([1, 6, 2]));
check('parseSemver parses rt-v tag', JSON.stringify(updates.parseSemver('rt-v1.5.1')) === JSON.stringify([1, 5, 1]));
check('parseSemver handles null/empty', JSON.stringify(updates.parseSemver(null)) === JSON.stringify([0, 0, 0]));

// 2. Kiểm tra so sánh semver
check('compareSemver equals', updates.compareSemver('1.6.2', '1.6.2') === 0);
check('compareSemver greater patch', updates.compareSemver('1.5.1', '1.5.0') > 0);
check('compareSemver greater minor', updates.compareSemver('1.6.0', '1.5.1') > 0);
check('compareSemver lower', updates.compareSemver('1.5.0', '1.5.1') < 0);
check('compareSemver with tags', updates.compareSemver('studio-v1.6.2', '1.6.2') === 0);
check('compareSemver rt tag > 1.5.0', updates.compareSemver('rt-v1.5.1', '1.5.0') > 0);

// 3. Tách biệt Yana Studio và yana-rt
check('Studio current version is 1.6.2', updates.STUDIO_CURRENT_VERSION === '1.6.2');
check('Studio v1.6.2 vs remote studio-v1.6.2 has NO update', updates.compareSemver('studio-v1.6.2', updates.STUDIO_CURRENT_VERSION) === 0);
check('Runtime v1.5.0 vs remote rt-v1.5.1 HAS core update', updates.compareSemver('1.5.1', '1.5.0') > 0);

// 4. Đăng ký lệnh yana.updates.check
const subscriptions = [];
updates.activate({ subscriptions });
check('activate registers command yana.updates.check', mockCommands.has('yana.updates.check'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

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

// 3. Phiên bản Studio đọc từ product.json (yanaStudioVersion), không ghi cứng
const fs = require('node:fs');
const os = require('node:os');
const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-updates-test-'));
const writeProduct = product => fs.writeFileSync(path.join(appRoot, 'product.json'), JSON.stringify(product));
fakeVscode.env.appRoot = appRoot;

writeProduct({ nameShort: 'Yana Studio', yanaStudioVersion: '1.7.0' });
check('Studio version comes from product.json', updates.studioCurrentVersion() === '1.7.0');
writeProduct({ nameShort: 'Yana Studio' });
check('missing yanaStudioVersion gives null', updates.studioCurrentVersion() === null);
writeProduct({ yanaStudioVersion: '' });
check('empty yanaStudioVersion gives null', updates.studioCurrentVersion() === null);
writeProduct({ yanaStudioVersion: '../../etc\u0000' });
check('garbage yanaStudioVersion gives null', updates.studioCurrentVersion() === null);
fs.writeFileSync(path.join(appRoot, 'product.json'), '{not json');
check('broken product.json gives null', updates.studioCurrentVersion() === null);
check('Runtime v1.5.0 vs remote rt-v1.5.1 HAS core update', updates.compareSemver('1.5.1', '1.5.0') > 0);

// 4. Không báo cập nhật khi đã cài bản mới nhất (lỗi cũ: số 1.6.2 ghi cứng nên luôn báo)
const t = { studioFound: () => 'found', btnDownloadStudio: 'd', btnChangelog: 'c', btnLater: 'l' };
let prompts = 0;
fakeVscode.window.showInformationMessage = () => { prompts++; return Promise.resolve(); };
globalThis.fetch = async () => ({ ok: true, json: async () => [{ tag_name: 'studio-v1.7.0' }, { tag_name: 'studio-v1.6.2' }] });

async function promptTests() {
	writeProduct({ yanaStudioVersion: '1.7.0' });
	prompts = 0;
	check('installed 1.7.0, latest 1.7.0: no prompt', (await updates.checkStudioUpdate(true, t)) === false && prompts === 0);
	writeProduct({ yanaStudioVersion: '1.6.2' });
	prompts = 0;
	check('installed 1.6.2, latest 1.7.0: prompt', (await updates.checkStudioUpdate(true, t)) === true && prompts === 1);
	writeProduct({ yanaStudioVersion: '1.8.0' });
	prompts = 0;
	check('installed newer than latest: no prompt', (await updates.checkStudioUpdate(true, t)) === false && prompts === 0);
	writeProduct({ nameShort: 'Yana Studio' });
	prompts = 0;
	check('unknown installed version: no prompt', (await updates.checkStudioUpdate(true, t)) === false && prompts === 0);
}

promptTests().then(() => {
	// 5. Đăng ký lệnh yana.updates.check
	const subscriptions = [];
	updates.activate({ subscriptions });
	check('activate registers command yana.updates.check', mockCommands.has('yana.updates.check'));
	fs.rmSync(appRoot, { recursive: true, force: true });
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
});

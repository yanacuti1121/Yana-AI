// Kiểm tra phần điều khiển độ dài trả lời, nhiệt độ và dò xem yana-rt có hiểu các trường mới không.
// Dùng: node tests/chat-controls.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const ext = process.argv[2] || path.resolve(__dirname, "../extensions/yana-agent");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'vscode' ? 'vscode' : origResolve.call(this, request, ...rest); };
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: {} };

const { parseMaxTokens, parseTemperature } = require(path.join(ext, 'features/chat-controls.js'));
const { supportsTurnControls, forgetProbe } = require(path.join(ext, 'runtime.js'));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };
const throws = fn => { try { fn(); return false; } catch { return true; } };

check('empty max tokens means the provider default', parseMaxTokens('') === null && parseMaxTokens(null) === null && parseMaxTokens('  ') === null);
check('valid max tokens', parseMaxTokens('1') === 1 && parseMaxTokens('32000') === 32000 && parseMaxTokens(' 1500 ') === 1500);
for (const bad of ['0', '-5', '32001', '1.5', 'abc', '1e3', '0x10', '99999999999999999999']) {
	check(`max tokens refuses ${JSON.stringify(bad)}`, throws(() => parseMaxTokens(bad)));
}
check('empty temperature means the provider default', parseTemperature('') === null && parseTemperature(undefined) === null);
check('zero is a real temperature, not empty', parseTemperature('0') === 0);
check('valid temperatures', parseTemperature('0.7') === 0.7 && parseTemperature('2') === 2 && parseTemperature('1.25') === 1.25);
for (const bad of ['-0.1', '2.01', 'hot', 'NaN', 'Infinity', '1,5', '.5']) {
	check(`temperature refuses ${JSON.stringify(bad)}`, throws(() => parseTemperature(bad)));
}

// Dò runtime: hai binary giả, một cũ (từ chối trường lạ) và một mới (kiểm tra giá trị mode).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-probe-'));
const fake = (name, line) => {
	const file = path.join(dir, name);
	fs.writeFileSync(file, `#!/bin/sh\ncat >/dev/null\nprintf '%s\\n' '${line}'\n`, { mode: 0o755 });
	return file;
};
const oldRuntime = fake('old-rt', '{"message":"invalid headless turn JSON","type":"error"}');
const newRuntime = fake('new-rt', '{"message":"mode must be \'act\' or \'plan\', got \'__probe__\'","type":"error"}');
const silent = path.join(dir, 'silent-rt');
fs.writeFileSync(silent, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

(async () => {
	check('an old runtime is detected as not supporting the controls', (await supportsTurnControls(oldRuntime)) === false);
	check('a new runtime is detected as supporting them', (await supportsTurnControls(newRuntime)) === true);
	check('a runtime that says nothing is treated as not supporting', (await supportsTurnControls(silent)) === false);
	check('a missing binary is treated as not supporting', (await supportsTurnControls(path.join(dir, 'nope'))) === false);
	check('no binary at all is treated as not supporting', (await supportsTurnControls('')) === false);
	forgetProbe();
	check('the answer is cached per binary and can be forgotten', (await supportsTurnControls(newRuntime)) === true);

	// Binary thật trên máy này nếu có (bản build mới nhất): phải trả lời đúng một trong hai, không treo.
	const real = path.join(path.dirname(path.dirname(ext)), '..', '..', 'target', 'debug', 'yana-rt');
	if (fs.existsSync(real)) {
		const supported = await supportsTurnControls(real);
		check(`the real debug yana-rt answers the probe (supports controls: ${supported})`, typeof supported === 'boolean');
	}

	fs.rmSync(dir, { recursive: true, force: true });
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();

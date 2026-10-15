// Kiểm tra phần kiểm tra bản mới: so sánh phiên bản, xác minh chữ ký Ed25519, kiểm tra tệp thông tin, giới hạn khi tải.
// Dùng: node tests/update-check.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');

const ext = process.argv[2];
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'vscode' ? 'vscode' : origResolve.call(this, request, ...rest); };
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: {} };

const update = require(path.join(ext, 'features/update-check.js'));
const { compareVersions, parseManifest, verifyManifest, checkForUpdate, shouldCheckNow, fetchBytes, MANIFEST_URL, SIGNATURE_URL, MAX_MANIFEST_BYTES } = update;

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };
const throws = (fn, pattern) => { try { fn(); return false; } catch (error) { return pattern ? pattern.test(error.message) : true; } };
const rejects = async (promise, pattern) => { try { await promise; return false; } catch (error) { return pattern ? pattern.test(error.message) : true; } };

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const otherKey = crypto.generateKeyPairSync('ed25519').publicKey;
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
const otherPem = otherKey.export({ type: 'spki', format: 'pem' });
const sign = bytes => crypto.sign(null, bytes, privateKey).toString('base64');

const manifestObject = (extra = {}) => ({ schema: 1, channel: 'stable', version: '1.6.0', released: '2026-10-20', notes: 'Improvements and fixes.', downloadUrl: 'https://yana.vutam.link/download', ...extra });
const manifestBytes = (extra = {}) => Buffer.from(JSON.stringify(manifestObject(extra)));

// --- versions
check('versions compare as numbers, not text', compareVersions('1.10.0', '1.9.0') === 1 && compareVersions('1.2.3', '1.2.3') === 0 && compareVersions('0.9.9', '1.0.0') === -1);
check('an invalid version is refused', throws(() => compareVersions('1.2', '1.0.0')) && throws(() => compareVersions('1.2.x', '1.0.0')) && throws(() => compareVersions('', '1.0.0')));

// --- manifest
const ok = parseManifest(manifestBytes().toString());
check('a valid manifest is accepted', ok.version === '1.6.0' && ok.downloadUrl === 'https://yana.vutam.link/download' && ok.security === false, JSON.stringify(ok));
check('a security flag is kept', parseManifest(manifestBytes({ security: true }).toString()).security === true);
const bad = extra => throws(() => parseManifest(manifestBytes(extra).toString()));
check('a wrong schema is refused', bad({ schema: 2 }));
check('a malformed version is refused', bad({ version: '1.6' }) && bad({ version: 'latest' }) && bad({ version: '1.6.0; rm -rf' }));
check('a malformed date is refused', bad({ released: 'yesterday' }));
check('a download link outside the Yana site is refused', bad({ downloadUrl: 'https://evil.example/download' }) && bad({ downloadUrl: 'http://yana.vutam.link/download' }) && bad({ downloadUrl: 'javascript:alert(1)' }));
check('a download link with credentials, a port or a look-alike host is refused', bad({ downloadUrl: 'https://yana.vutam.link@evil.example/' }) && bad({ downloadUrl: 'https://yana.vutam.link:8443/' }) && bad({ downloadUrl: 'https://yana.vutam.link.evil.example/' }));
check('notes are cleaned and cut', (() => { const n = parseManifest(manifestBytes({ notes: `a\nb\u0007${'x'.repeat(500)}` }).toString()).notes; return !/[\x00-\x1f]/.test(n) && n.length <= 300; })());
check('text that is not JSON is refused', throws(() => parseManifest('not json')) && throws(() => parseManifest('[]')) && throws(() => parseManifest('null')));

// --- signature
const bytes = manifestBytes();
check('a correct signature is accepted', verifyManifest(bytes, sign(bytes), publicPem).version === '1.6.0');
check('a changed manifest is refused', throws(() => verifyManifest(manifestBytes({ version: '9.9.9' }), sign(bytes), publicPem), /signature/i));
check('a signature from another key is refused', throws(() => verifyManifest(bytes, sign(bytes), otherPem), /signature/i));
check('a garbage signature is refused', throws(() => verifyManifest(bytes, 'not base64 !!', publicPem), /signature/i));
check('a build without a public key never accepts a manifest', throws(() => verifyManifest(bytes, sign(bytes), ''), /not set up|not configured/i));

// --- fetching
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, arrayBuffer: async () => new Uint8Array(Buffer.from(body)).buffer, headers: { get: () => null } });
(async () => {
	let seen = [];
	const serving = (manifest, signature, status = 200) => async (url, options) => { seen.push({ url, options }); return url === MANIFEST_URL ? response(manifest, status) : response(signature, status); };

	const sig = sign(bytes);
	const newer = await checkForUpdate({ currentVersion: '1.5.0', publicKeyPem: publicPem, fetchImpl: serving(bytes, sig) });
	check('a newer version is reported', newer.status === 'newer' && newer.manifest.version === '1.6.0', JSON.stringify(newer));
	check('both files come only from the Yana site over https', seen.length === 2 && seen.every(s => s.url.startsWith('https://yana.vutam.link/')) && seen[0].url === MANIFEST_URL && seen[1].url === SIGNATURE_URL);
	check('redirects are refused and no cookies are sent', seen.every(s => s.options.redirect === 'error' && s.options.credentials === 'omit'), JSON.stringify(seen[0]?.options));
	check('the request carries no more than a product name and version', seen.every(s => Object.keys(s.options.headers || {}).every(key => key.toLowerCase() === 'user-agent') && /^YanaStudio\/1\.5\.0$/.test(s.options.headers['User-Agent'])), JSON.stringify(seen[0]?.options?.headers));
	let calls = 0;
	check('without a public key nothing is sent at all', await rejects(checkForUpdate({ currentVersion: '1.5.0', publicKeyPem: '', fetchImpl: async () => { calls++; return response('x'); } }), /not set up/i) && calls === 0);
	check('the same version is current', (await checkForUpdate({ currentVersion: '1.6.0', publicKeyPem: publicPem, fetchImpl: serving(bytes, sig) })).status === 'current');
	check('a newer app than the manifest is not an update', (await checkForUpdate({ currentVersion: '2.0.0', publicKeyPem: publicPem, fetchImpl: serving(bytes, sig) })).status === 'current');
	check('a tampered manifest on the server is refused', await rejects(checkForUpdate({ currentVersion: '1.5.0', publicKeyPem: publicPem, fetchImpl: serving(manifestBytes({ version: '9.9.9' }), sig) }), /signature/i));
	check('a server error is an error, not "no update"', await rejects(checkForUpdate({ currentVersion: '1.5.0', publicKeyPem: publicPem, fetchImpl: serving('x', 'y', 404) }), /404|status/i));
	check('an oversized manifest is refused', await rejects(checkForUpdate({ currentVersion: '1.5.0', publicKeyPem: publicPem, fetchImpl: serving('x'.repeat(MAX_MANIFEST_BYTES + 1), sig) }), /too large/i));
	const redirected = async () => { const error = new TypeError('fetch failed'); error.cause = new Error('unexpected redirect'); throw error; };
	check('a redirect is explained, because a host move or a trailing-slash setting can cause one', await rejects(checkForUpdate({ currentVersion: '1.5.0', publicKeyPem: publicPem, fetchImpl: redirected }), /redirect.*(not followed|do not follow)/i));
	check('a refused redirect surfaces as an error', await rejects(checkForUpdate({ currentVersion: '1.5.0', publicKeyPem: publicPem, fetchImpl: async () => { throw new TypeError('fetch failed: redirect mode is set to error'); } }), /redirect|failed/i));
	check('a URL outside the Yana site is never fetched', await rejects(fetchBytes('https://evil.example/latest.json', { fetchImpl: async () => { throw new Error('must not be called'); } }), /not an allowed address/i) && await rejects(fetchBytes('http://yana.vutam.link/latest.json', { fetchImpl: async () => { throw new Error('must not be called'); } }), /not an allowed address/i));

	// --- throttle
	const DAY = 24 * 60 * 60 * 1000;
	check('a check is due the first time and after a day, not before', shouldCheckNow(0, 1000, DAY) === true && shouldCheckNow(1000, 1000 + DAY - 1, DAY) === false && shouldCheckNow(1000, 1000 + DAY, DAY) === true);
	check('a clock set back does not block checks forever', shouldCheckNow(10 * DAY, 1 * DAY, DAY) === true);

	// --- the signing script, end to end
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-update-test-'));
	const script = path.join(ext, '..', '..', 'scripts', 'sign-update-manifest.mjs');
	const gen = execFileSync('node', [script, 'generate', '--out', dir], { encoding: 'utf8' });
	const generatedPem = fs.readFileSync(path.join(dir, 'update-public-key.pem'), 'utf8');
	check('the script writes a key pair and says to keep the private key offline', fs.existsSync(path.join(dir, 'update-private-key.pem')) && /offline|never commit/i.test(gen) && /BEGIN PUBLIC KEY/.test(generatedPem));
	const mode = fs.statSync(path.join(dir, 'update-private-key.pem')).mode & 0o777;
	check('the private key file is readable only by its owner', mode === 0o600, mode.toString(8));
	fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(manifestObject()));
	execFileSync('node', [script, 'sign', '--key', path.join(dir, 'update-private-key.pem'), '--manifest', path.join(dir, 'latest.json')], { encoding: 'utf8' });
	const signed = verifyManifest(fs.readFileSync(path.join(dir, 'latest.json')), fs.readFileSync(path.join(dir, 'latest.json.sig'), 'utf8').trim(), generatedPem);
	check('a manifest signed by the script verifies with the generated public key', signed.version === '1.6.0');
	fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify(manifestObject({ downloadUrl: 'https://evil.example/' })));
	check('the script refuses to sign a manifest the app would reject', (() => { try { execFileSync('node', [script, 'sign', '--key', path.join(dir, 'update-private-key.pem'), '--manifest', path.join(dir, 'bad.json')], { stdio: 'pipe' }); return false; } catch { return true; } })());

	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();

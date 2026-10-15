// Tạo cặp khoá Ed25519 và ký tệp thông tin phiên bản (latest.json) cho tính năng kiểm tra bản mới của Yana Studio.
//
//   node sign-update-manifest.mjs generate --out <thư mục NGOÀI repo>
//   node sign-update-manifest.mjs sign --key <update-private-key.pem> --manifest <latest.json>
//
// `generate` ghi update-private-key.pem (chỉ chủ file đọc được) và update-public-key.pem. Khoá công khai dán vào
// extensions/yana-agent/features/update-public-key.js. Khoá riêng phải giữ OFFLINE và không bao giờ commit: ai có nó thì
// đẩy được "bản mới" giả tới mọi người dùng. `sign` ghi latest.json.sig cạnh latest.json, rồi tự xác minh lại.
// Script từ chối ký một tệp mà chính app sẽ từ chối đọc.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseManifest, verifyManifest } = require('../extensions/yana-agent/features/update-check.js');

const PRIVATE_KEY_FILE = 'update-private-key.pem';
const PUBLIC_KEY_FILE = 'update-public-key.pem';
const OWNER_ONLY = 0o600;

function option(name) {
	const index = process.argv.indexOf(`--${name}`);
	return index !== -1 ? process.argv[index + 1] : undefined;
}

function fail(message) {
	console.error(`sign-update-manifest: ${message}`);
	process.exit(1);
}

function generate() {
	const out = option('out') ?? fail('generate needs --out <directory outside the repository>');
	fs.mkdirSync(out, { recursive: true });
	const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
	const privatePath = path.join(out, PRIVATE_KEY_FILE);
	const publicPath = path.join(out, PUBLIC_KEY_FILE);
	// flag 'wx': never overwrite a key that already exists.
	fs.writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: OWNER_ONLY, flag: 'wx' });
	fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' });
	console.log(`Wrote ${privatePath} and ${publicPath}.`);
	console.log('Keep the private key offline and never commit it: whoever holds it can push a fake update to every user.');
	console.log('Paste the public key into extensions/yana-agent/features/update-public-key.js.');
}

function sign() {
	const keyPath = option('key') ?? fail('sign needs --key <private key file>');
	const manifestPath = option('manifest') ?? fail('sign needs --manifest <latest.json>');
	const bytes = fs.readFileSync(manifestPath);
	try {
		parseManifest(bytes.toString('utf8'));
	} catch (error) {
		fail(`the app would reject this manifest, so it is not signed: ${error.message}`);
	}
	const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
	const signature = crypto.sign(null, bytes, privateKey).toString('base64');
	const publicPem = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
	verifyManifest(bytes, signature, publicPem); // a signature that does not verify must never be written
	fs.writeFileSync(`${manifestPath}.sig`, `${signature}\n`);
	console.log(`Signed ${manifestPath}: wrote ${manifestPath}.sig and verified it.`);
}

const command = process.argv[2];
if (command === 'generate') generate();
else if (command === 'sign') sign();
else fail('usage: generate --out <dir> | sign --key <pem> --manifest <latest.json>');

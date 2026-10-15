'use strict';
// Báo cho người dùng khi có bản Yana Studio mới. Chỉ THÔNG BÁO: không tự tải, không tự cài, không chạy gì.
// App chưa ký nên không thể dựa vào chữ ký của hệ điều hành để biết một "bản mới" có thật hay không. Vì vậy tệp thông
// tin (latest.json) phải có chữ ký Ed25519 (latest.json.sig) khớp với khoá công khai nằm trong app. Chiếm được trang web
// hay repo vẫn không đẩy được một "bản mới" giả.
// Dữ liệu gửi đi: một yêu cầu GET tới đúng hai địa chỉ bên dưới, chỉ kèm User-Agent "YanaStudio/<phiên bản>". Không định
// danh máy, không thư mục dự án, không cookie, không theo chuyển hướng. Người dùng tắt được bằng cài đặt yana.updates.check.

const crypto = require('node:crypto');
const { UPDATE_PUBLIC_KEY_PEM } = require('./update-public-key');

const UPDATE_HOST = 'yana.vutam.link';
const MANIFEST_URL = `https://${UPDATE_HOST}/latest.json`;
const SIGNATURE_URL = `${MANIFEST_URL}.sig`;
const MAX_MANIFEST_BYTES = 16 * 1024; // tệp thông tin thật chỉ vài trăm byte
const MAX_SIGNATURE_BYTES = 1024; // chữ ký Ed25519 dạng base64 dài 88 ký tự
const REQUEST_TIMEOUT_MS = 10 * 1000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // hỏi tối đa một lần mỗi ngày
const STARTUP_DELAY_MS = 30 * 1000; // không làm chậm lúc khởi động
const MAX_NOTES_CHARS = 300;
const SCHEMA = 1;
const VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LAST_CHECK_KEY = 'yana.updates.lastCheck';

function parseVersion(text) {
	if (typeof text !== 'string' || !VERSION_PATTERN.test(text)) throw new Error(`"${String(text).slice(0, 30)}" is not a version like 1.2.3`);
	return text.split('.').map(Number);
}

/** -1, 0 hoặc 1. So từng số, không so chuỗi: 1.10.0 lớn hơn 1.9.0. */
function compareVersions(a, b) {
	const left = parseVersion(a);
	const right = parseVersion(b);
	for (let i = 0; i < 3; i++) {
		if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
	}
	return 0;
}

/** Chỉ https, đúng host của Yana, không tên đăng nhập, không cổng riêng. */
function allowedAddress(url) {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' && parsed.hostname === UPDATE_HOST && !parsed.username && !parsed.password && parsed.port === '';
	} catch {
		return false;
	}
}

function oneLine(value, maxChars) {
	return String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

/** Kiểm tra chặt tệp thông tin. Chỉ các trường được liệt kê mới đi tiếp. */
function parseManifest(text) {
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error('The update information is not valid JSON');
	}
	if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The update information has the wrong shape');
	if (data.schema !== SCHEMA) throw new Error(`The update information uses schema ${data.schema}, this app understands ${SCHEMA}`);
	parseVersion(data.version);
	if (typeof data.released !== 'string' || !DATE_PATTERN.test(data.released)) throw new Error('The update information has no valid release date');
	if (!allowedAddress(data.downloadUrl)) throw new Error('The download link is not an allowed address');
	return { version: data.version, released: data.released, notes: oneLine(data.notes, MAX_NOTES_CHARS), downloadUrl: data.downloadUrl, security: data.security === true };
}

/** Xác minh chữ ký trên đúng các byte nhận được, rồi mới đọc nội dung. */
function verifyManifest(bytes, signatureBase64, publicKeyPem) {
	if (!publicKeyPem) throw new Error('Update checks are not set up in this build (no public key)');
	let valid = false;
	try {
		const signature = Buffer.from(String(signatureBase64).trim(), 'base64');
		valid = signature.length > 0 && crypto.verify(null, bytes, crypto.createPublicKey(publicKeyPem), signature);
	} catch {
		valid = false;
	}
	if (!valid) throw new Error('The update information has an invalid signature');
	return parseManifest(Buffer.from(bytes).toString('utf8'));
}

async function fetchBytes(url, { fetchImpl = fetch, maxBytes = MAX_MANIFEST_BYTES, timeoutMs = REQUEST_TIMEOUT_MS, version = 'unknown' } = {}) {
	if (!allowedAddress(url)) throw new Error(`${url} is not an allowed address`);
	let response;
	try {
		response = await fetchImpl(url, {
			redirect: 'error',
			credentials: 'omit',
			cache: 'no-store',
			headers: { 'User-Agent': `YanaStudio/${version}` },
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (error) {
		// Redirects are refused on purpose. Say so, because moving the site or a trailing-slash setting causes one.
		const reason = String(error?.cause?.message || error?.message || error);
		throw new Error(/redirect/i.test(reason)
			? 'The update server redirected the request. Update checks do not follow redirects: serve latest.json and latest.json.sig directly at the site root.'
			: `The update server could not be reached (${reason})`);
	}
	if (!response.ok) throw new Error(`The update server answered with status ${response.status}`);
	const declared = Number(response.headers?.get?.('content-length'));
	if (declared > maxBytes) throw new Error('The update file is too large');
	const bytes = Buffer.from(await response.arrayBuffer());
	if (bytes.length > maxBytes) throw new Error('The update file is too large');
	return bytes;
}

/** { status: 'newer' | 'current', manifest }. Sai chữ ký, sai dạng hay lỗi mạng đều là lỗi, không phải "không có bản mới". */
async function checkForUpdate({ currentVersion, publicKeyPem = UPDATE_PUBLIC_KEY_PEM, fetchImpl = fetch }) {
	parseVersion(currentVersion);
	if (!publicKeyPem) throw new Error('Update checks are not set up in this build (no public key)'); // chưa gửi gì ra ngoài
	const options = { fetchImpl, version: currentVersion };
	const manifestBytes = await fetchBytes(MANIFEST_URL, options);
	const signature = await fetchBytes(SIGNATURE_URL, { ...options, maxBytes: MAX_SIGNATURE_BYTES });
	const manifest = verifyManifest(manifestBytes, signature.toString('utf8'), publicKeyPem);
	return { status: compareVersions(manifest.version, currentVersion) > 0 ? 'newer' : 'current', manifest };
}

/** Đã đến lúc hỏi chưa. Đồng hồ bị chỉnh lùi thì hỏi luôn, không để bị chặn mãi. */
function shouldCheckNow(lastCheckedMs, nowMs, intervalMs) {
	return !lastCheckedMs || nowMs < lastCheckedMs || nowMs - lastCheckedMs >= intervalMs;
}

async function runCheck(context, { manual }) {
	const vscode = require('vscode');
	const config = vscode.workspace.getConfiguration('yana');
	if (!manual && !config.get('updates.check', true)) return;
	if (!UPDATE_PUBLIC_KEY_PEM) {
		if (manual) vscode.window.showInformationMessage('Yana: update checks are not set up in this build.');
		return;
	}
	if (!manual && !shouldCheckNow(context.globalState.get(LAST_CHECK_KEY, 0), Date.now(), CHECK_INTERVAL_MS)) return;
	await context.globalState.update(LAST_CHECK_KEY, Date.now()); // ghi trước khi gọi mạng: lỗi không gây hỏi lặp lại liên tục
	const currentVersion = context.extension.packageJSON.version;
	let result;
	try {
		result = await checkForUpdate({ currentVersion });
	} catch (error) {
		if (manual) vscode.window.showWarningMessage(`Yana: could not check for updates: ${error.message}`);
		return;
	}
	if (result.status !== 'newer') {
		if (manual) vscode.window.showInformationMessage(`Yana Studio ${currentVersion} is up to date.`);
		return;
	}
	const { manifest } = result;
	const recommended = manifest.security ? ' We recommend updating.' : '';
	const open = 'Open Download Page';
	const never = "Don't Check Again";
	const answer = await vscode.window.showInformationMessage(`Yana Studio ${manifest.version} is available.${recommended}${manifest.notes ? ` ${manifest.notes}` : ''}`, open, 'Later', never);
	if (answer === open) await vscode.env.openExternal(vscode.Uri.parse(manifest.downloadUrl));
	if (answer === never) await config.update('updates.check', false, vscode.ConfigurationTarget.Global);
}

function activate(context) {
	const vscode = require('vscode');
	const timer = setTimeout(() => runCheck(context, { manual: false }).catch(() => undefined), STARTUP_DELAY_MS); // nền: không làm hỏng khởi động
	context.subscriptions.push(
		{ dispose: () => clearTimeout(timer) },
		vscode.commands.registerCommand('yana.updates.check', () => runCheck(context, { manual: true })),
	);
}

module.exports = {
	id: 'update-check', activate,
	compareVersions, parseManifest, verifyManifest, fetchBytes, checkForUpdate, shouldCheckNow, allowedAddress,
	MANIFEST_URL, SIGNATURE_URL, MAX_MANIFEST_BYTES,
};

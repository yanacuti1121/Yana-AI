'use strict';
// Tests for auth.js — account setup, login, sessions, legacy compat, rate limit.
// Run: node _test_auth.js   (exit 0 = pass, 1 = fail)
//
// Uses a throwaway YANA_DATA_DIR so the real .yana/ is never touched.
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-auth-test-'));
process.env.YANA_DATA_DIR = DATA_DIR;
const auth = require('./auth.js');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else      { fail++; console.log('FAIL  ' + name); }
}

// ── tiny req/res mocks ────────────────────────────────────────────────────────
function mockReq(ip, cookie) {
  return { headers: cookie ? { cookie } : {}, socket: { remoteAddress: ip } };
}
function mockRes() {
  const res = {
    status: 0, headers: {}, body: null,
    writeHead(s, h) { this.status = s; Object.assign(this.headers, h || {}); },
    setHeader(k, v) { this.headers[k] = v; },
    end(b) { this.body = b ? JSON.parse(b) : null; },
  };
  return res;
}
function call(handler, req, body) {
  const res = mockRes();
  handler(req, res, body);
  return res;
}
function cookieOf(res) {
  const sc = res.headers['Set-Cookie'] || '';
  const m = /yana_sid=([0-9a-f]+)/.exec(sc);
  return m ? 'yana_sid=' + m[1] : null;
}

// ── status before setup ───────────────────────────────────────────────────────
let r = call(auth.handleStatus, mockReq('10.0.0.1'));
t('status fresh: setup=false', r.body.setup === false);
t('status fresh: username=null', r.body.username === null);

// ── setup validation ──────────────────────────────────────────────────────────
r = call(auth.handleSetup, mockReq('10.0.0.1'), { password: 'secret123' });
t('setup without username → 400', r.status === 400);

r = call(auth.handleSetup, mockReq('10.0.0.1'), { username: 'x', password: 'secret123' });
t('setup 1-char username → 400', r.status === 400);

r = call(auth.handleSetup, mockReq('10.0.0.1'), { username: 'a'.repeat(33), password: 'secret123' });
t('setup 33-char username → 400', r.status === 400);

r = call(auth.handleSetup, mockReq('10.0.0.1'), { username: 'ab\u0000cd', password: 'secret123' });
t('setup control-char username → 400', r.status === 400);

r = call(auth.handleSetup, mockReq('10.0.0.1'), { username: 'Tâm', password: 'short' });
t('setup 5-char password → 400', r.status === 400);

// ── successful setup ──────────────────────────────────────────────────────────
r = call(auth.handleSetup, mockReq('10.0.0.1'), { username: 'Tâm', password: 'secret123' });
t('setup valid → 200', r.status === 200 && r.body.ok === true);
const setupCookie = cookieOf(r);
t('setup sets session cookie', !!setupCookie);
t('cookie is HttpOnly', /HttpOnly/.test(r.headers['Set-Cookie'] || ''));

const rec = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'auth.json'), 'utf8'));
t('auth.json stores username', rec.username === 'Tâm');
t('auth.json has salt + hash', !!rec.salt && !!rec.hash);
t('auth.json never stores plaintext password',
  !fs.readFileSync(path.join(DATA_DIR, 'auth.json'), 'utf8').includes('secret123'));

r = call(auth.handleStatus, mockReq('10.0.0.1'));
t('status after setup: setup=true + username', r.body.setup === true && r.body.username === 'Tâm');

r = call(auth.handleSetup, mockReq('10.0.0.1'), { username: 'Khác', password: 'secret123' });
t('second setup → 409', r.status === 409);

// ── login ─────────────────────────────────────────────────────────────────────
r = call(auth.handleLogin, mockReq('10.0.0.2'), { username: 'hacker', password: 'secret123' });
t('login wrong username → 401', r.status === 401 && /username or password/i.test(r.body.error));

r = call(auth.handleLogin, mockReq('10.0.0.3'), { username: 'Tâm', password: 'wrongpass' });
t('login wrong password → 401', r.status === 401);

// NFD + different case: what a Vietnamese IME can produce must still match
r = call(auth.handleLogin, mockReq('10.0.0.4'),
  { username: 'tâm'.normalize('NFD'), password: 'secret123' });
t('login NFD lowercase username → 200', r.status === 200);
const loginCookie = cookieOf(r);

// ── sessions ──────────────────────────────────────────────────────────────────
t('isAuthed true with session cookie', auth.isAuthed(mockReq('10.0.0.4', loginCookie)) === true);
t('isAuthed false without cookie', auth.isAuthed(mockReq('10.0.0.4')) === false);
t('isAuthed false with bogus token', auth.isAuthed(mockReq('10.0.0.4', 'yana_sid=' + 'f'.repeat(64))) === false);

r = call(auth.handleLogout, mockReq('10.0.0.4', loginCookie));
t('logout → 200', r.status === 200);
t('isAuthed false after logout', auth.isAuthed(mockReq('10.0.0.4', loginCookie)) === false);

// ── legacy record (pre-username) keeps working ────────────────────────────────
const legacy = { salt: rec.salt, hash: rec.hash, created: rec.created };
fs.writeFileSync(path.join(DATA_DIR, 'auth.json'), JSON.stringify(legacy));

r = call(auth.handleStatus, mockReq('10.0.0.5'));
t('legacy status: username=null', r.body.setup === true && r.body.username === null);

r = call(auth.handleLogin, mockReq('10.0.0.5'), { password: 'secret123' });
t('legacy login without username → 200', r.status === 200);

r = call(auth.handleLogin, mockReq('10.0.0.6'), { username: 'anything', password: 'secret123' });
t('legacy login with stray username → 200', r.status === 200);

// ── login rate limit: 5 per 15 min per IP ─────────────────────────────────────
let last = null;
for (let i = 0; i < 6; i++) {
  last = call(auth.handleLogin, mockReq('10.9.9.9'), { password: 'wrongpass' });
}
t('6th attempt from same IP → 429', last.status === 429);
t('429 carries Retry-After', !!last.headers['Retry-After']);

// ── result ────────────────────────────────────────────────────────────────────
fs.rmSync(DATA_DIR, { recursive: true, force: true });
console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

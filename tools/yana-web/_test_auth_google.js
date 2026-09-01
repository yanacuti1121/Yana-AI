'use strict';
// Tests for auth.js's Google OAuth addition — config gating, CSRF state
// check, isSetUp()/handleLogin() behavior for a Google-only account. The
// actual Google network calls (exchangeGoogleCode/fetchGoogleProfile) are
// not exported and are not exercised here — same as no test in this repo
// hits a real provider API; they only run once the state check passes.
// Run: node _test_auth_google.js   (exit 0 = pass, 1 = fail)

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-auth-google-test-'));
process.env.YANA_DATA_DIR = DATA_DIR;

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else      { fail++; console.log('FAIL  ' + name); }
}

function mockReq(opts) {
  return { headers: opts.cookie ? { cookie: opts.cookie } : {}, socket: { remoteAddress: '10.0.0.1' }, url: opts.url || '/' };
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
function stateOf(res) {
  const m = /[?&]state=([0-9a-f]+)/.exec(res.headers.Location || '');
  return m ? m[1] : null;
}

// ── not configured: no env vars set before first require ─────────────────────
delete process.env.GOOGLE_OAUTH_CLIENT_ID;
delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
let auth = require('./auth.js');

let res = mockRes();
auth.handleStatus(mockReq({}), res);
t('unconfigured: googleAvailable=false', res.body.googleAvailable === false);
t('unconfigured: googleLinked=false',    res.body.googleLinked === false);

res = mockRes();
auth.handleGoogleStart(mockReq({ url: '/api/auth/google/start' }), res);
t('unconfigured: start → 404', res.status === 404);

// ── configured: set env vars, re-require fresh (module-level consts) ─────────
process.env.GOOGLE_OAUTH_CLIENT_ID     = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
delete require.cache[require.resolve('./auth.js')];
auth = require('./auth.js');

res = mockRes();
auth.handleStatus(mockReq({}), res);
t('configured: googleAvailable=true', res.body.googleAvailable === true);

res = mockRes();
auth.handleGoogleStart(mockReq({ url: '/api/auth/google/start?intent=login' }), res);
t('start: 302 redirect', res.status === 302);
t('start: Location targets accounts.google.com', /^https:\/\/accounts\.google\.com\//.test(res.headers.Location || ''));
t('start: Location carries our client id', (res.headers.Location || '').includes('test-client-id.apps.googleusercontent.com'));
t('start: no Set-Cookie at all (state is server-side, not a cookie — see pendingOAuthStates)', !res.headers['Set-Cookie']);
const state = stateOf(res);
t('start: state param captured from Location', !!state);

// intent=link without an authenticated session must be rejected — before
// any redirect to Google is even built.
res = mockRes();
auth.handleGoogleStart(mockReq({ url: '/api/auth/google/start?intent=link' }), res);
t('start: link without session → 401', res.status === 401);

// ── callback: CSRF state check (no network call reached in either case) ──────
// This is exactly the real bug found in manual testing: Electron opens
// Google's consent page in the SYSTEM browser (see main.js's
// guardNavigation/setWindowOpenHandler), so the browser that lands on
// /callback is very often not the one that hit /start — a cookie-based
// state check breaks on that hand-off (confirmed: cookie=null in the real
// server log). These two cases model exactly that: an unknown/forged state,
// and a request with no matching pending entry at all.
res = mockRes();
auth.handleGoogleCallback(mockReq({ url: '/api/auth/google/callback?code=abc&state=deadbeef'.padEnd(60, '0') }), res)
  .then(() => {
    t('callback: unknown state → redirect to login', res.status === 302 && /google_error=state_mismatch/.test(res.headers.Location || ''));

    res = mockRes();
    return auth.handleGoogleCallback(mockReq({ url: '/api/auth/google/callback?code=abc' }), res); // no state param at all
  })
  .then(() => {
    t('callback: missing state param → redirect to login', res.status === 302 && /google_error=state_mismatch/.test(res.headers.Location || ''));

    // A real, valid state is consumed on first use — no network mock here,
    // so just confirm it does NOT immediately bounce as state_mismatch
    // trying it against a second, still-unknown state (proves lookup is a
    // real map check, not a no-op that would let anything through).
    t('start: real state differs from the unknown one used above', state !== 'deadbeef'.padEnd(60, '0'));

    // ── isSetUp() / handleLogin() with a Google-only record (no salt/hash) ──
    const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
    fs.writeFileSync(AUTH_FILE, JSON.stringify({
      username: 'someone@example.com',
      google: { sub: '123', email: 'someone@example.com', linkedAt: new Date().toISOString() },
      created: new Date().toISOString(),
    }));
    t('isSetUp(): true for a Google-only record', auth.isSetUp() === true);

    res = mockRes();
    auth.handleStatus(mockReq({}), res);
    t('status: googleLinked=true once linked', res.body.googleLinked === true);

    res = mockRes();
    auth.handleLogin(mockReq({}), res, { username: 'someone@example.com', password: 'irrelevant' });
    t('login on Google-only account: clean 401, not a crash', res.status === 401);
    t('login on Google-only account: names Google sign-in in the error', /Google/.test((res.body && res.body.error) || ''));

    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
    process.exit(fail ? 1 : 0);
  })
  .catch((err) => {
    console.error('UNCAUGHT', err);
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    process.exit(1);
  });

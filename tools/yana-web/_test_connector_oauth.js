'use strict';
// Tests for connector-oauth.js — config gating, scope allowlist, CSRF
// state handling, and the pending-store hand-off contract. Same scope
// limit as _test_auth_google.js: the actual Google network calls
// (exchangeCode/refreshAccessToken/fetchUserinfo/revokeToken) are not
// exercised here — no test in this repo hits a real provider API. Those
// only run once the state check passes, and only a live, logged-in run
// (anh actually completing the OAuth consent screen) proves they work
// end-to-end against the real Gmail/Calendar APIs.
// Run: node _test_connector_oauth.js   (exit 0 = pass, 1 = fail)

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else      { fail++; console.log('FAIL  ' + name); }
}

function mockReq(opts) {
  return { headers: {}, socket: { remoteAddress: '10.0.0.1' }, url: opts.url || '/' };
}
function mockRes() {
  const res = {
    status: 0, headers: {}, body: null,
    writeHead(s, h) { this.status = s; Object.assign(this.headers, h || {}); },
    setHeader(k, v) { this.headers[k] = v; },
    end(b) { this.body = b; try { this.json = JSON.parse(b); } catch (_) { this.json = null; } },
  };
  return res;
}

async function run() {
  // ── not configured: no env vars before first require ─────────────────────
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  let mod = require('./connector-oauth');

  t('unconfigured: googleConnectorsConfigured() is false', mod.googleConnectorsConfigured() === false);

  let res = mockRes();
  mod.handleConnectorGoogleStart(mockReq({ url: '/api/connectors/google/start?connector=gmail' }), res);
  t('unconfigured: start → 404', res.status === 404);

  res = mockRes();
  await mod.handleConnectorGoogleCallback(mockReq({ url: '/api/connectors/google/callback' }), res);
  t('unconfigured: callback → 200 HTML with a failure message (never crashes)', res.status === 200 && res.body.includes('Could not connect'));

  // ── configured: set env vars, re-require fresh (module-level consts) ────
  process.env.GOOGLE_OAUTH_CLIENT_ID     = 'test-connector-client.apps.googleusercontent.com';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-connector-secret';
  delete require.cache[require.resolve('./connector-oauth')];
  mod = require('./connector-oauth');

  t('configured: googleConnectorsConfigured() is true', mod.googleConnectorsConfigured() === true);
  t('scope map: gmail is readonly (least privilege)', mod.CONNECTOR_SCOPES.gmail === 'https://www.googleapis.com/auth/gmail.readonly');
  t('scope map: calendar is readonly (least privilege)', mod.CONNECTOR_SCOPES['google-calendar'] === 'https://www.googleapis.com/auth/calendar.readonly');
  t('scope map: no write/modify/send scope leaked in for either', !Object.values(mod.CONNECTOR_SCOPES).some((s) => /modify|send|\.calendar(?!\.readonly)/.test(s)));

  res = mockRes();
  mod.handleConnectorGoogleStart(mockReq({ url: '/api/connectors/google/start?connector=notion' }), res);
  t('start: unsupported connector → 400 (only gmail/google-calendar exist today)', res.status === 400);

  res = mockRes();
  mod.handleConnectorGoogleStart(mockReq({ url: '/api/connectors/google/start?connector=gmail' }), res);
  t('start: 200 with an authUrl + state', res.status === 200 && !!res.json.authUrl && !!res.json.state);
  t('start: authUrl targets accounts.google.com', /^https:\/\/accounts\.google\.com\//.test(res.json.authUrl));
  t('start: authUrl requests offline access + forces consent (refresh_token issuance)', res.json.authUrl.includes('access_type=offline') && res.json.authUrl.includes('prompt=consent'));
  t('start: authUrl carries the gmail.readonly scope', res.json.authUrl.includes(encodeURIComponent(mod.CONNECTOR_SCOPES.gmail)));
  const state = res.json.state;

  // ── pending: unknown/never-issued state ───────────────────────────────────
  res = mockRes();
  mod.handleConnectorGooglePending(mockReq({}), res, 'deadbeef'.padEnd(48, '0'));
  t('pending: unknown state → 404', res.status === 404);

  // ── pending: freshly started flow is still "pending" (no callback yet) ───
  res = mockRes();
  mod.handleConnectorGooglePending(mockReq({}), res, state);
  t('pending: reports status=pending before the callback lands', res.status === 200 && res.json.status === 'pending');

  // ── callback: unknown state → user-facing failure page, not a crash ──────
  res = mockRes();
  await mod.handleConnectorGoogleCallback(mockReq({ url: '/api/connectors/google/callback?code=abc&state=' + 'f'.repeat(48) }), res);
  t('callback: unknown state → 200 HTML explaining it expired/was reused', res.status === 200 && res.body.includes('expired'));

  // ── callback: denied (no code) on a REAL pending state ────────────────────
  res = mockRes();
  mod.handleConnectorGoogleStart(mockReq({ url: '/api/connectors/google/start?connector=google-calendar' }), res);
  const state2 = res.json.state;
  res = mockRes();
  await mod.handleConnectorGoogleCallback(mockReq({ url: `/api/connectors/google/callback?state=${state2}` }), res);
  t('callback: no code param → cancelled page', res.status === 200 && res.body.includes('cancelled'));

  res = mockRes();
  mod.handleConnectorGooglePending(mockReq({}), res, state2);
  t('pending: denied flow surfaces status=error, not a fake success', res.status === 200 && res.json.status === 'error' && res.json.error === 'denied');

  res = mockRes();
  mod.handleConnectorGooglePending(mockReq({}), res, state2);
  t('pending: error state is one-time — second read is gone', res.status === 404);

  // ── refresh / revoke: input validation without reaching the network ──────
  res = mockRes();
  await mod.handleConnectorGoogleRefresh(mockReq({}), res, {});
  t('refresh: missing refreshToken → 400', res.status === 400);

  res = mockRes();
  await mod.handleConnectorGoogleRevoke(mockReq({}), res, {});
  t('revoke: missing token → 400', res.status === 400);

  console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

run().catch((err) => { console.error('UNCAUGHT', err); process.exit(1); });

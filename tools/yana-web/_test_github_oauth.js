'use strict';
// Tests for github-oauth.js — config gating, CSRF state handling, and the
// pending-store hand-off contract. Same scope limit as
// _test_connector_oauth.js: exchangeCode/fetchGithubUser/revokeGithubToken
// (the actual GitHub network calls) are not exercised here. Only a real,
// logged-in click-through of GitHub's consent screen proves those work.
// Run: node _test_github_oauth.js   (exit 0 = pass, 1 = fail)

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
  // ── not configured ────────────────────────────────────────────────────────
  delete process.env.GITHUB_OAUTH_CLIENT_ID;
  delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
  let mod = require('./github-oauth');

  t('unconfigured: githubConnectorConfigured() is false', mod.githubConnectorConfigured() === false);

  let res = mockRes();
  mod.handleGithubStart(mockReq({ url: '/api/connectors/github/start' }), res);
  t('unconfigured: start → 404', res.status === 404);

  res = mockRes();
  await mod.handleGithubCallback(mockReq({ url: '/api/connectors/github/callback' }), res);
  t('unconfigured: callback → 200 HTML with a failure message (never crashes)', res.status === 200 && res.body.includes('not configured'));

  res = mockRes();
  await mod.handleGithubRevoke(mockReq({}), res, { token: 'x' });
  t('unconfigured: revoke → 404', res.status === 404);

  // ── configured ───────────────────────────────────────────────────────────
  process.env.GITHUB_OAUTH_CLIENT_ID     = 'test-client-id';
  process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-client-secret';
  delete require.cache[require.resolve('./github-oauth')];
  mod = require('./github-oauth');

  t('configured: githubConnectorConfigured() is true', mod.githubConnectorConfigured() === true);
  t('scope: least-privilege notifications, not repo', mod.SCOPE === 'notifications');

  res = mockRes();
  mod.handleGithubStart(mockReq({ url: '/api/connectors/github/start' }), res);
  t('start: 200 with an authUrl + state', res.status === 200 && !!res.json.authUrl && !!res.json.state);
  t('start: authUrl targets github.com/login/oauth/authorize', /^https:\/\/github\.com\/login\/oauth\/authorize\?/.test(res.json.authUrl));
  t('start: authUrl carries the notifications scope', res.json.authUrl.includes(`scope=${mod.SCOPE}`));
  const state = res.json.state;

  res = mockRes();
  mod.handleGithubPending(mockReq({}), res, 'deadbeef'.padEnd(48, '0'));
  t('pending: unknown state → 404', res.status === 404);

  res = mockRes();
  mod.handleGithubPending(mockReq({}), res, state);
  t('pending: reports status=pending before the callback lands', res.status === 200 && res.json.status === 'pending');

  res = mockRes();
  await mod.handleGithubCallback(mockReq({ url: '/api/connectors/github/callback?code=abc&state=' + 'f'.repeat(48) }), res);
  t('callback: unknown state → 200 HTML explaining it expired/was reused', res.status === 200 && res.body.includes('expired'));

  res = mockRes();
  await mod.handleGithubCallback(mockReq({ url: `/api/connectors/github/callback?state=${state}` }), res);
  t('callback: no code param → cancelled page', res.status === 200 && res.body.includes('cancelled'));

  res = mockRes();
  mod.handleGithubPending(mockReq({}), res, state);
  t('pending: denied flow surfaces status=error, not a fake success', res.status === 200 && res.json.status === 'error' && res.json.error === 'denied');

  res = mockRes();
  mod.handleGithubPending(mockReq({}), res, state);
  t('pending: error state is one-time — second read is gone', res.status === 404);

  res = mockRes();
  await mod.handleGithubRevoke(mockReq({}), res, {});
  t('revoke: missing token → 400', res.status === 400);

  console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

run().catch((err) => { console.error('UNCAUGHT', err); process.exit(1); });

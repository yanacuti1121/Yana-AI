'use strict';
// Tests for notion-oauth.js — config gating, CSRF state handling, and the
// pending-store hand-off contract. Same scope limit as
// _test_github_oauth.js: exchangeCode/refreshAccessToken (the actual
// Notion network calls) are not exercised here. Only a real, logged-in
// click-through of Notion's page-picker consent screen proves those work.
// Run: node _test_notion_oauth.js   (exit 0 = pass, 1 = fail)

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
  delete process.env.NOTION_OAUTH_CLIENT_ID;
  delete process.env.NOTION_OAUTH_CLIENT_SECRET;
  let mod = require('./notion-oauth');

  t('unconfigured: notionConnectorConfigured() is false', mod.notionConnectorConfigured() === false);

  let res = mockRes();
  mod.handleNotionStart(mockReq({ url: '/api/connectors/notion/start' }), res);
  t('unconfigured: start → 404', res.status === 404);

  res = mockRes();
  await mod.handleNotionCallback(mockReq({ url: '/api/connectors/notion/callback' }), res);
  t('unconfigured: callback → 200 HTML with a failure message (never crashes)', res.status === 200 && res.body.includes('not configured'));

  res = mockRes();
  await mod.handleNotionRefresh(mockReq({}), res, { refreshToken: 'x' });
  t('unconfigured: refresh → 404', res.status === 404);

  // ── configured ───────────────────────────────────────────────────────────
  process.env.NOTION_OAUTH_CLIENT_ID     = 'test-client-id';
  process.env.NOTION_OAUTH_CLIENT_SECRET = 'test-client-secret';
  delete require.cache[require.resolve('./notion-oauth')];
  mod = require('./notion-oauth');

  t('configured: notionConnectorConfigured() is true', mod.notionConnectorConfigured() === true);

  res = mockRes();
  mod.handleNotionStart(mockReq({ url: '/api/connectors/notion/start' }), res);
  t('start: 200 with an authUrl + state', res.status === 200 && !!res.json.authUrl && !!res.json.state);
  t('start: authUrl targets api.notion.com/v1/oauth/authorize', /^https:\/\/api\.notion\.com\/v1\/oauth\/authorize\?/.test(res.json.authUrl));
  t('start: authUrl carries owner=user (no scope param — Notion access is picker-based)', res.json.authUrl.includes('owner=user'));
  t('start: authUrl carries no scope= param at all', !res.json.authUrl.includes('scope='));
  const state = res.json.state;

  res = mockRes();
  mod.handleNotionPending(mockReq({}), res, 'deadbeef'.padEnd(48, '0'));
  t('pending: unknown state → 404', res.status === 404);

  res = mockRes();
  mod.handleNotionPending(mockReq({}), res, state);
  t('pending: reports status=pending before the callback lands', res.status === 200 && res.json.status === 'pending');

  res = mockRes();
  await mod.handleNotionCallback(mockReq({ url: '/api/connectors/notion/callback?code=abc&state=' + 'f'.repeat(48) }), res);
  t('callback: unknown state → 200 HTML explaining it expired/was reused', res.status === 200 && res.body.includes('expired'));

  res = mockRes();
  await mod.handleNotionCallback(mockReq({ url: `/api/connectors/notion/callback?state=${state}` }), res);
  t('callback: no code param → cancelled page', res.status === 200 && res.body.includes('cancelled'));

  res = mockRes();
  mod.handleNotionPending(mockReq({}), res, state);
  t('pending: denied flow surfaces status=error, not a fake success', res.status === 200 && res.json.status === 'error' && res.json.error === 'denied');

  res = mockRes();
  mod.handleNotionPending(mockReq({}), res, state);
  t('pending: error state is one-time — second read is gone', res.status === 404);

  res = mockRes();
  await mod.handleNotionRefresh(mockReq({}), res, {});
  t('refresh: missing refreshToken → 400', res.status === 400);

  console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

run().catch((err) => { console.error('UNCAUGHT', err); process.exit(1); });

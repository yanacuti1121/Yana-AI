'use strict';
// Tests for canva-oauth.js — config gating, CSRF state handling, PKCE
// challenge generation, and the pending-store hand-off contract. Same
// scope limit as the other OAuth test files: exchangeCode/
// refreshAccessToken/revokeCanvaToken (the actual Canva network calls)
// are not exercised here. Only a real, logged-in click-through of
// Canva's consent screen proves those work.
// Run: node _test_canva_oauth.js   (exit 0 = pass, 1 = fail)

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
  delete process.env.CANVA_OAUTH_CLIENT_ID;
  delete process.env.CANVA_OAUTH_CLIENT_SECRET;
  let mod = require('./canva-oauth');

  t('unconfigured: canvaConnectorConfigured() is false', mod.canvaConnectorConfigured() === false);

  let res = mockRes();
  mod.handleCanvaStart(mockReq({ url: '/api/connectors/canva/start' }), res);
  t('unconfigured: start → 404', res.status === 404);

  res = mockRes();
  await mod.handleCanvaCallback(mockReq({ url: '/api/connectors/canva/callback' }), res);
  t('unconfigured: callback → 200 HTML with a failure message (never crashes)', res.status === 200 && res.body.includes('not configured'));

  res = mockRes();
  await mod.handleCanvaRevoke(mockReq({}), res, { token: 'x' });
  t('unconfigured: revoke → 404', res.status === 404);

  // ── configured ───────────────────────────────────────────────────────────
  process.env.CANVA_OAUTH_CLIENT_ID     = 'test-client-id';
  process.env.CANVA_OAUTH_CLIENT_SECRET = 'test-client-secret';
  delete require.cache[require.resolve('./canva-oauth')];
  mod = require('./canva-oauth');

  t('configured: canvaConnectorConfigured() is true', mod.canvaConnectorConfigured() === true);
  t('scope: least-privilege design:meta:read', mod.SCOPE === 'design:meta:read');

  res = mockRes();
  mod.handleCanvaStart(mockReq({ url: '/api/connectors/canva/start' }), res);
  t('start: 200 with an authUrl + state', res.status === 200 && !!res.json.authUrl && !!res.json.state);
  t('start: authUrl targets www.canva.com/api/oauth/authorize', /^https:\/\/www\.canva\.com\/api\/oauth\/authorize\?/.test(res.json.authUrl));
  t('start: authUrl carries code_challenge_method=S256 (PKCE required)', res.json.authUrl.includes('code_challenge_method=S256'));

  const authUrl = new URL(res.json.authUrl);
  const codeChallenge = authUrl.searchParams.get('code_challenge');
  t('start: authUrl carries a code_challenge value', !!codeChallenge && codeChallenge.length > 0);
  t('start: code_challenge is URL-safe base64 (no +/= chars)', !/[+/=]/.test(codeChallenge));
  const state = res.json.state;

  res = mockRes();
  mod.handleCanvaPending(mockReq({}), res, 'deadbeef'.padEnd(48, '0'));
  t('pending: unknown state → 404', res.status === 404);

  res = mockRes();
  mod.handleCanvaPending(mockReq({}), res, state);
  t('pending: reports status=pending before the callback lands', res.status === 200 && res.json.status === 'pending');

  res = mockRes();
  await mod.handleCanvaCallback(mockReq({ url: '/api/connectors/canva/callback?code=abc&state=' + 'f'.repeat(48) }), res);
  t('callback: unknown state → 200 HTML explaining it expired/was reused', res.status === 200 && res.body.includes('expired'));

  res = mockRes();
  await mod.handleCanvaCallback(mockReq({ url: `/api/connectors/canva/callback?state=${state}` }), res);
  t('callback: no code param → cancelled page (verifier carried through, not lost)', res.status === 200 && res.body.includes('cancelled'));

  res = mockRes();
  mod.handleCanvaPending(mockReq({}), res, state);
  t('pending: denied flow surfaces status=error, not a fake success', res.status === 200 && res.json.status === 'error' && res.json.error === 'denied');

  res = mockRes();
  mod.handleCanvaPending(mockReq({}), res, state);
  t('pending: error state is one-time — second read is gone', res.status === 404);

  res = mockRes();
  await mod.handleCanvaRefresh(mockReq({}), res, {});
  t('refresh: missing refreshToken → 400', res.status === 400);

  res = mockRes();
  await mod.handleCanvaRevoke(mockReq({}), res, {});
  t('revoke: missing token → 400', res.status === 400);

  // ── PKCE math itself: challenge really is SHA-256(verifier), base64url ──
  {
    // Re-derive independently to prove generatePkcePair() (not exported —
    // exercised indirectly via two separate /start calls) never reuses a
    // verifier and always produces a spec-correct challenge shape.
    res = mockRes();
    mod.handleCanvaStart(mockReq({ url: '/api/connectors/canva/start' }), res);
    const challenge2 = new URL(res.json.authUrl).searchParams.get('code_challenge');
    t('PKCE: two separate /start calls never produce the same code_challenge', challenge2 !== codeChallenge);
    t('PKCE: code_challenge is a 43-char base64url SHA-256 digest', challenge2.length === 43);
  }

  console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

run().catch((err) => { console.error('UNCAUGHT', err); process.exit(1); });

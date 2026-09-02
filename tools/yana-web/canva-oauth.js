'use strict';
// Canva Connect API OAuth 2.0 for the "canva" connector — same lifecycle
// shape as the other connectors (own client_id/secret, connector-oauth.js's
// shared pending-store CSRF pattern, Basic-auth token exchange), plus one
// real requirement none of the other five connectors have: Canva's
// Connect API REQUIRES PKCE (verified against Canva's own docs, not
// assumed) — a code_verifier generated here at /start time, hashed into
// a code_challenge sent in the authorize URL, then the SAME verifier
// sent back at token-exchange time. The verifier has to survive between
// those two requests without ever reaching the browser/renderer, so it
// rides inside the existing oauth-pending-store record alongside
// `status` — no new storage mechanism, just one more field on data
// every other connector's pending record already carries.
//
// Other real differences:
//   - Refresh tokens rotate on every use (Canva's own docs: "each
//     refresh token can only be used once") — the new one MUST be saved
//     back or the connection silently breaks after the very next
//     refresh. connectorFetchWithRefresh's generic refreshedToken.
//     refreshToken field (added for this) already handles that.
//   - Canva DOES document a real revoke endpoint, unlike Notion/Figma.
const crypto = require('crypto');
const { httpsJson } = require('./lib/https-json');
const { createPendingStore } = require('./lib/oauth-pending-store');

const CANVA_CLIENT_ID     = process.env.CANVA_OAUTH_CLIENT_ID || '';
const CANVA_CLIENT_SECRET = process.env.CANVA_OAUTH_CLIENT_SECRET || '';
const PENDING_TTL_MS      = 5 * 60_000;
const SCOPE                = 'design:meta:read';

const pending = createPendingStore(PENDING_TTL_MS);

function canvaConnectorConfigured() {
  return !!(CANVA_CLIENT_ID && CANVA_CLIENT_SECRET);
}

function canvaRedirectUri(req) {
  const host = req.headers.host || '127.0.0.1';
  return `http://${host}/api/connectors/canva/callback`;
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function html(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function resultPage(ok, message) {
  const color = ok ? '#31d098' : '#fb7185';
  const title = ok ? 'Connected' : 'Could not connect';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} — Yana</title>
<style>body{font-family:system-ui,sans-serif;background:#0e111a;color:#f3f5fb;display:grid;place-items:center;height:100vh;margin:0}
main{max-width:420px;text-align:center;padding:0 24px}
h1{color:${color};font-size:20px}
p{color:#9ea7bd;font-size:14px;line-height:1.6}</style></head>
<body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

function basicAuthHeader() {
  return `Basic ${Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString('base64')}`;
}

// PKCE, S256 — Canva's own documented recipe (43-128 char verifier,
// URL-safe base64, SHA-256 challenge, also URL-safe base64).
function generatePkcePair() {
  const codeVerifier = crypto.randomBytes(64).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

async function exchangeCode(code, redirectUri, codeVerifier) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier,
  }).toString();
  const { status, body: tokenRes } = await httpsJson({
    hostname: 'api.canva.com', path: '/rest/v1/oauth/token', method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basicAuthHeader(), 'content-length': Buffer.byteLength(form) },
  }, form);
  if (status !== 200 || !tokenRes.access_token) {
    throw new Error(`token_exchange_failed status=${status} error=${tokenRes.error || tokenRes.message || '?'}`);
  }
  return tokenRes;
}

async function refreshAccessToken(refreshToken) {
  const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString();
  const { status, body: tokenRes } = await httpsJson({
    hostname: 'api.canva.com', path: '/rest/v1/oauth/token', method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basicAuthHeader(), 'content-length': Buffer.byteLength(form) },
  }, form);
  if (status !== 200 || !tokenRes.access_token) {
    throw new Error(`token_refresh_failed status=${status} error=${tokenRes.error || '?'}`);
  }
  return tokenRes; // includes a rotated refresh_token — caller must persist it
}

async function revokeCanvaToken(token) {
  const form = new URLSearchParams({ token }).toString();
  try {
    const { status } = await httpsJson({
      hostname: 'api.canva.com', path: '/rest/v1/oauth/revoke', method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basicAuthHeader(), 'content-length': Buffer.byteLength(form) },
    }, form);
    return status === 200;
  } catch (_) {
    return false;
  }
}

// GET /api/connectors/canva/start
function handleCanvaStart(req, res) {
  if (!canvaConnectorConfigured()) { json(res, 404, { ok: false, error: 'Canva connector is not configured' }); return; }
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = pending.create({ status: 'pending', codeVerifier });
  const params = new URLSearchParams({
    client_id: CANVA_CLIENT_ID,
    redirect_uri: canvaRedirectUri(req),
    scope: SCOPE,
    state,
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  json(res, 200, { ok: true, state, authUrl: `https://www.canva.com/api/oauth/authorize?${params.toString()}` });
}

// GET /api/connectors/canva/callback — PUBLIC route, same reasoning as
// the other connectors' callbacks.
async function handleCanvaCallback(req, res) {
  if (!canvaConnectorConfigured()) { html(res, 200, resultPage(false, 'The Canva connector is not configured.')); return; }

  let query;
  try { query = new URL(req.url, 'http://internal').searchParams; }
  catch (_) { html(res, 200, resultPage(false, 'Malformed callback request.')); return; }

  const state = query.get('state');
  const record = state ? pending.peek(state) : null;
  if (!record) {
    html(res, 200, resultPage(false, 'This connection request expired or was already used. Close this tab and click Connect again in Yana Desktop.'));
    return;
  }

  const code = query.get('code');
  if (!code) {
    pending.update(state, { status: 'error', error: 'denied', codeVerifier: record.codeVerifier });
    html(res, 200, resultPage(false, 'Connection was cancelled.'));
    return;
  }

  try {
    const tokenRes = await exchangeCode(code, canvaRedirectUri(req), record.codeVerifier);
    pending.update(state, {
      status: 'ready',
      tokens: {
        accessToken: tokenRes.access_token,
        refreshToken: tokenRes.refresh_token || null,
        expiresAt: Date.now() + (Number(tokenRes.expires_in) || 0) * 1000,
        email: null, // Canva's token response carries no user identity field; the panel shows no email, same as GitHub's @-less fallback
      },
    });
    html(res, 200, resultPage(true, 'Connected to your Canva account. You can close this tab and return to Yana Desktop.'));
  } catch (err) {
    console.error('[canva-oauth] callback failed:', err.message);
    pending.update(state, { status: 'error', error: 'exchange_failed', codeVerifier: record.codeVerifier });
    html(res, 200, resultPage(false, 'Could not complete the connection. Close this tab and try again.'));
  }
}

// GET /api/connectors/canva/pending/:state
function handleCanvaPending(req, res, state) {
  const record = pending.peek(state);
  if (!record) { json(res, 404, { ok: false, error: 'not_found' }); return; }
  if (record.status === 'pending') { json(res, 200, { ok: true, status: 'pending' }); return; }
  if (record.status === 'error') {
    pending.consume(state);
    json(res, 200, { ok: true, status: 'error', error: record.error });
    return;
  }
  const data = pending.consume(state);
  json(res, 200, { ok: true, status: 'ready', tokens: data.tokens });
}

// POST /api/connectors/canva/refresh  { refreshToken }
async function handleCanvaRefresh(req, res, body) {
  if (!canvaConnectorConfigured()) { json(res, 404, { ok: false, error: 'Canva connector is not configured' }); return; }
  const refreshToken = body && body.refreshToken;
  if (typeof refreshToken !== 'string' || !refreshToken) { json(res, 400, { ok: false, error: 'Missing refreshToken' }); return; }
  try {
    const tokenRes = await refreshAccessToken(refreshToken);
    json(res, 200, {
      ok: true,
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token, // rotated — the caller MUST persist this
      expiresAt: Date.now() + (Number(tokenRes.expires_in) || 0) * 1000,
    });
  } catch (err) {
    console.error('[canva-oauth] refresh failed:', err.message);
    json(res, 200, { ok: false, error: 'refresh_failed' });
  }
}

// POST /api/connectors/canva/revoke  { token }
async function handleCanvaRevoke(req, res, body) {
  if (!canvaConnectorConfigured()) { json(res, 404, { ok: false, error: 'Canva connector is not configured' }); return; }
  const token = body && body.token;
  if (typeof token !== 'string' || !token) { json(res, 400, { ok: false, error: 'Missing token' }); return; }
  const revoked = await revokeCanvaToken(token);
  json(res, 200, { ok: revoked });
}

module.exports = {
  SCOPE,
  canvaConnectorConfigured,
  handleCanvaStart,
  handleCanvaCallback,
  handleCanvaPending,
  handleCanvaRefresh,
  handleCanvaRevoke,
  refreshAccessToken,
};

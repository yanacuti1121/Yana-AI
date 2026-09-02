'use strict';
// Figma OAuth 2.0 for the "figma" connector — same lifecycle shape as
// github-oauth.js (own client_id/secret, connector-oauth.js's shared
// pending-store CSRF pattern, Basic-auth token exchange like
// notion-oauth.js), with Figma's own real differences:
//
//   - Real refresh_token support (POST /v1/oauth/refresh, same Basic-auth
//     shape as the initial exchange) — unlike GitHub, like Notion/Canva.
//   - No documented revoke/deauthorize API endpoint (confirmed via
//     Figma's own docs + search, not assumed) — a user revokes access
//     from their own Figma account settings UI instead. Disconnect here
//     is therefore local-only, same situation as notion-oauth.js.
//   - No generic "list my recent files" REST endpoint exists — Figma's
//     file listing needs a team_id the OAuth token alone doesn't resolve
//     (GET /v1/teams/:team_id/projects, a value this app has no way to
//     discover per-user without asking the user to paste one in). So
//     there is no connector-figma-adapter.js "preview" call, honestly:
//     this connector's real, current capability is Connect/Disconnect +
//     confirmed identity via GET /v1/me, matching GithubConnectorPanel's
//     simpler shape (no Preview button) rather than the Google-family
//     panels' shape.
const { httpsJson } = require('./lib/https-json');
const { createPendingStore } = require('./lib/oauth-pending-store');

const FIGMA_CLIENT_ID     = process.env.FIGMA_OAUTH_CLIENT_ID || '';
const FIGMA_CLIENT_SECRET = process.env.FIGMA_OAUTH_CLIENT_SECRET || '';
const PENDING_TTL_MS      = 5 * 60_000;
const SCOPE                = 'file_content:read';

const pending = createPendingStore(PENDING_TTL_MS);

function figmaConnectorConfigured() {
  return !!(FIGMA_CLIENT_ID && FIGMA_CLIENT_SECRET);
}

function figmaRedirectUri(req) {
  const host = req.headers.host || '127.0.0.1';
  return `http://${host}/api/connectors/figma/callback`;
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
  return `Basic ${Buffer.from(`${FIGMA_CLIENT_ID}:${FIGMA_CLIENT_SECRET}`).toString('base64')}`;
}

async function exchangeCode(code, redirectUri) {
  const form = new URLSearchParams({ redirect_uri: redirectUri, code, grant_type: 'authorization_code' }).toString();
  const { status, body: tokenRes } = await httpsJson({
    hostname: 'api.figma.com', path: '/v1/oauth/token', method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basicAuthHeader(), 'content-length': Buffer.byteLength(form) },
  }, form);
  if (status !== 200 || !tokenRes.access_token) {
    throw new Error(`token_exchange_failed status=${status} error=${tokenRes.error || tokenRes.message || '?'}`);
  }
  return tokenRes;
}

async function fetchFigmaUser(accessToken) {
  const { status, body: user } = await httpsJson({
    hostname: 'api.figma.com', path: '/v1/me', method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (status !== 200) throw new Error(`user_lookup_failed status=${status}`);
  return user;
}

async function refreshAccessToken(refreshToken) {
  const form = new URLSearchParams({ refresh_token: refreshToken }).toString();
  const { status, body: tokenRes } = await httpsJson({
    hostname: 'api.figma.com', path: '/v1/oauth/refresh', method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basicAuthHeader(), 'content-length': Buffer.byteLength(form) },
  }, form);
  if (status !== 200 || !tokenRes.access_token) {
    throw new Error(`token_refresh_failed status=${status} error=${tokenRes.error || '?'}`);
  }
  return tokenRes;
}

// GET /api/connectors/figma/start
function handleFigmaStart(req, res) {
  if (!figmaConnectorConfigured()) { json(res, 404, { ok: false, error: 'Figma connector is not configured' }); return; }
  const state = pending.create({ status: 'pending' });
  const params = new URLSearchParams({
    client_id: FIGMA_CLIENT_ID,
    redirect_uri: figmaRedirectUri(req),
    scope: SCOPE,
    state,
    response_type: 'code',
  });
  json(res, 200, { ok: true, state, authUrl: `https://www.figma.com/oauth?${params.toString()}` });
}

// GET /api/connectors/figma/callback — PUBLIC route, same reasoning as
// the other connectors' callbacks.
async function handleFigmaCallback(req, res) {
  if (!figmaConnectorConfigured()) { html(res, 200, resultPage(false, 'The Figma connector is not configured.')); return; }

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
    pending.update(state, { status: 'error', error: 'denied' });
    html(res, 200, resultPage(false, 'Connection was cancelled.'));
    return;
  }

  try {
    const tokenRes = await exchangeCode(code, figmaRedirectUri(req));
    const user = await fetchFigmaUser(tokenRes.access_token);
    pending.update(state, {
      status: 'ready',
      tokens: {
        accessToken: tokenRes.access_token,
        refreshToken: tokenRes.refresh_token || null,
        expiresAt: Date.now() + (Number(tokenRes.expires_in) || 0) * 1000,
        email: user.email || user.handle || null,
      },
    });
    html(res, 200, resultPage(true, `Connected as ${user.email || user.handle || 'your Figma account'}. You can close this tab and return to Yana Desktop.`));
  } catch (err) {
    console.error('[figma-oauth] callback failed:', err.message);
    pending.update(state, { status: 'error', error: 'exchange_failed' });
    html(res, 200, resultPage(false, 'Could not complete the connection. Close this tab and try again.'));
  }
}

// GET /api/connectors/figma/pending/:state — one-time read, same
// contract as the other connectors' pending endpoints.
function handleFigmaPending(req, res, state) {
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

// POST /api/connectors/figma/refresh  { refreshToken }
async function handleFigmaRefresh(req, res, body) {
  if (!figmaConnectorConfigured()) { json(res, 404, { ok: false, error: 'Figma connector is not configured' }); return; }
  const refreshToken = body && body.refreshToken;
  if (typeof refreshToken !== 'string' || !refreshToken) { json(res, 400, { ok: false, error: 'Missing refreshToken' }); return; }
  try {
    const tokenRes = await refreshAccessToken(refreshToken);
    json(res, 200, { ok: true, accessToken: tokenRes.access_token, expiresAt: Date.now() + (Number(tokenRes.expires_in) || 0) * 1000 });
  } catch (err) {
    console.error('[figma-oauth] refresh failed:', err.message);
    json(res, 200, { ok: false, error: 'refresh_failed' });
  }
}

module.exports = {
  SCOPE,
  figmaConnectorConfigured,
  handleFigmaStart,
  handleFigmaCallback,
  handleFigmaPending,
  handleFigmaRefresh,
  refreshAccessToken,
};

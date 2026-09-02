'use strict';
// Notion OAuth for the "notion" connector — same lifecycle shape as
// github-oauth.js (own client_id/secret, connector-oauth.js's shared
// pending-store CSRF pattern), with the real differences Notion's own
// flow has rather than papering over them:
//
//   - No `scope` parameter at all. Notion OAuth doesn't grant a scope
//     string — access is whatever pages/databases the user picks in
//     Notion's own page-picker during consent. `owner=user` is the only
//     access-model parameter the authorize URL takes.
//   - Token exchange is HTTP Basic (`client_id:client_secret`), not
//     client_id/secret in the POST body the way github-oauth.js does it.
//   - Unlike GitHub, Notion DOES issue a refresh_token (confirmed against
//     Notion's own current docs, not assumed from memory) — so there is
//     a handleNotionRefresh here, same shape as connector-oauth.js's
//     Google refresh.
//   - No documented token-revocation endpoint. Disconnect is therefore
//     local-only (clearConnectorCredential on the renderer side) — no
//     best-effort revoke call to make, unlike Google/GitHub.
const { httpsJson } = require('./lib/https-json');
const { createPendingStore } = require('./lib/oauth-pending-store');

const NOTION_CLIENT_ID     = process.env.NOTION_OAUTH_CLIENT_ID || '';
const NOTION_CLIENT_SECRET = process.env.NOTION_OAUTH_CLIENT_SECRET || '';
const PENDING_TTL_MS       = 5 * 60_000;
const NOTION_VERSION       = '2022-06-28';

const pending = createPendingStore(PENDING_TTL_MS);

function notionConnectorConfigured() {
  return !!(NOTION_CLIENT_ID && NOTION_CLIENT_SECRET);
}

function notionRedirectUri(req) {
  const host = req.headers.host || '127.0.0.1';
  return `http://${host}/api/connectors/notion/callback`;
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
  return `Basic ${Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64')}`;
}

async function exchangeCode(code, redirectUri) {
  const body = JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const { status, body: tokenRes } = await httpsJson({
    hostname: 'api.notion.com', path: '/v1/oauth/token', method: 'POST',
    headers: { 'content-type': 'application/json', authorization: basicAuthHeader(), 'content-length': Buffer.byteLength(body) },
  }, body);
  if (status !== 200 || !tokenRes.access_token) {
    throw new Error(`token_exchange_failed status=${status} error=${tokenRes.error || '?'}`);
  }
  return tokenRes;
}

async function refreshAccessToken(refreshToken) {
  const body = JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken });
  const { status, body: tokenRes } = await httpsJson({
    hostname: 'api.notion.com', path: '/v1/oauth/token', method: 'POST',
    headers: { 'content-type': 'application/json', authorization: basicAuthHeader(), 'content-length': Buffer.byteLength(body) },
  }, body);
  if (status !== 200 || !tokenRes.access_token) {
    throw new Error(`token_refresh_failed status=${status} error=${tokenRes.error || '?'}`);
  }
  return tokenRes;
}

// GET /api/connectors/notion/start
function handleNotionStart(req, res) {
  if (!notionConnectorConfigured()) { json(res, 404, { ok: false, error: 'Notion connector is not configured' }); return; }
  const state = pending.create({ status: 'pending' });
  const params = new URLSearchParams({
    client_id: NOTION_CLIENT_ID,
    redirect_uri: notionRedirectUri(req),
    response_type: 'code',
    owner: 'user',
    state,
  });
  json(res, 200, { ok: true, state, authUrl: `https://api.notion.com/v1/oauth/authorize?${params.toString()}` });
}

// GET /api/connectors/notion/callback — PUBLIC route, same reasoning as
// connector-oauth.js's Google callback (oauth-pending-store.js's header
// comment: lands in the system browser, not necessarily the app window).
async function handleNotionCallback(req, res) {
  if (!notionConnectorConfigured()) { html(res, 200, resultPage(false, 'The Notion connector is not configured.')); return; }

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
    const tokenRes = await exchangeCode(code, notionRedirectUri(req));
    pending.update(state, {
      status: 'ready',
      tokens: {
        accessToken: tokenRes.access_token,
        refreshToken: tokenRes.refresh_token || null,
        expiresAt: null, // Notion does not return an expires_in — treated as long-lived until a 401 proves otherwise
        workspaceName: tokenRes.workspace_name || null,
        email: tokenRes.workspace_name || null, // reused as the UI identity label — see use-notion-connector.js
      },
    });
    html(res, 200, resultPage(true, `Connected to ${tokenRes.workspace_name || 'your Notion workspace'}. You can close this tab and return to Yana Desktop.`));
  } catch (err) {
    console.error('[notion-oauth] callback failed:', err.message);
    pending.update(state, { status: 'error', error: 'exchange_failed' });
    html(res, 200, resultPage(false, 'Could not complete the connection. Close this tab and try again.'));
  }
}

// GET /api/connectors/notion/pending/:state — one-time read, same
// contract as connector-oauth.js's handleConnectorGooglePending.
function handleNotionPending(req, res, state) {
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

// POST /api/connectors/notion/refresh  { refreshToken }
async function handleNotionRefresh(req, res, body) {
  if (!notionConnectorConfigured()) { json(res, 404, { ok: false, error: 'Notion connector is not configured' }); return; }
  const refreshToken = body && body.refreshToken;
  if (typeof refreshToken !== 'string' || !refreshToken) { json(res, 400, { ok: false, error: 'Missing refreshToken' }); return; }
  try {
    const tokenRes = await refreshAccessToken(refreshToken);
    json(res, 200, { ok: true, accessToken: tokenRes.access_token, refreshToken: tokenRes.refresh_token || refreshToken });
  } catch (err) {
    console.error('[notion-oauth] refresh failed:', err.message);
    json(res, 200, { ok: false, error: 'refresh_failed' });
  }
}

module.exports = {
  NOTION_VERSION,
  notionConnectorConfigured,
  handleNotionStart,
  handleNotionCallback,
  handleNotionPending,
  handleNotionRefresh,
  // Exported for handleConnectorNotionPages's connectorFetchWithRefresh
  // call in server.js — same reason connector-oauth.js exports its own
  // refreshAccessToken alongside handleConnectorGoogleRefresh.
  refreshAccessToken,
};

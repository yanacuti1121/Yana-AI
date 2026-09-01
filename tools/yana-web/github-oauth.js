'use strict';
// GitHub OAuth for the "github" connector — replaces the old
// YANA_GITHUB_ACCESS_TOKEN-from-shell-environment path with a real
// Connect button, same lifecycle shape as connector-oauth.js's Google
// flow (reuses the same pending-store CSRF pattern), but two real
// differences from Google worth calling out rather than papering over:
//
//   - No refresh token / no expiry: a classic GitHub OAuth App token
//     does not expire and GitHub does not issue a refresh_token for it
//     (that only happens for GitHub Apps with expiring tokens enabled,
//     which this is not). So there is no handleGithubRefresh here — a
//     revoked/invalid token just needs Reconnect, not a refresh retry.
//   - No JS-side data adapter: unlike Gmail/Calendar (whose reads live
//     entirely in connector-google-adapters.js), the actual GitHub sync
//     already exists in the Rust runtime (src/connector.rs's
//     sync_github, reading process.env.YANA_GITHUB_ACCESS_TOKEN). This
//     module's only job is getting a real OAuth token into YanaVault;
//     tools/yana-desktop/connector-registry.js is what threads it into
//     that Rust process's environment at sync time (see its
//     syncConnector() accessToken param) — chosen over extending Rust's
//     SecretBackend with real set()/get() because that would be its own
//     Tier-1-security change (see connector-credentials.mjs's header
//     comment), where an env var passed to a subprocess Yana already
//     spawns is the existing, already-reviewed channel.
//
// Least privilege: the `notifications` OAuth scope grants exactly what
// sync_github's one API call (GET /notifications) needs — not the much
// broader `repo` scope classic GitHub OAuth commonly asks for.
const { httpsJson } = require('./lib/https-json');
const { createPendingStore } = require('./lib/oauth-pending-store');

const GITHUB_CLIENT_ID     = process.env.GITHUB_OAUTH_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET || '';
const PENDING_TTL_MS       = 5 * 60_000;
const SCOPE                = 'notifications';
const USER_AGENT            = 'Yana-Desktop';

const pending = createPendingStore(PENDING_TTL_MS);

function githubConnectorConfigured() {
  return !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
}

function githubRedirectUri(req) {
  const host = req.headers.host || '127.0.0.1';
  return `http://${host}/api/connectors/github/callback`;
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

async function exchangeCode(code, redirectUri) {
  const body = JSON.stringify({
    client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET,
    code, redirect_uri: redirectUri,
  });
  const { status, body: tokenRes } = await httpsJson({
    hostname: 'github.com', path: '/login/oauth/access_token', method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': USER_AGENT, 'content-length': Buffer.byteLength(body) },
  }, body);
  if (status !== 200 || tokenRes.error || !tokenRes.access_token) {
    throw new Error(`token_exchange_failed status=${status} error=${tokenRes.error || '?'}`);
  }
  return tokenRes;
}

async function fetchGithubUser(accessToken) {
  const { status, body: user } = await httpsJson({
    hostname: 'api.github.com', path: '/user', method: 'GET',
    headers: { authorization: `Bearer ${accessToken}`, 'user-agent': USER_AGENT, accept: 'application/vnd.github+json' },
  });
  if (status !== 200) throw new Error(`user_lookup_failed status=${status}`);
  return user;
}

async function revokeGithubToken(accessToken) {
  // DELETE /applications/{client_id}/token, Basic-authed as the OAuth
  // App itself (client_id:client_secret) — GitHub's documented way for
  // an app to invalidate a token it issued.
  const auth = Buffer.from(`${GITHUB_CLIENT_ID}:${GITHUB_CLIENT_SECRET}`).toString('base64');
  const body = JSON.stringify({ access_token: accessToken });
  try {
    const { status } = await httpsJson({
      hostname: 'api.github.com', path: `/applications/${GITHUB_CLIENT_ID}/token`, method: 'DELETE',
      headers: { authorization: `Basic ${auth}`, 'user-agent': USER_AGENT, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, body);
    return status === 204;
  } catch (_) {
    return false;
  }
}

// GET /api/connectors/github/start — same authenticated-route placement
// as connector-oauth.js's handleConnectorGoogleStart (see that file's
// comment: relies on server.js's existing top-level isAuthed(req) gate).
function handleGithubStart(req, res) {
  if (!githubConnectorConfigured()) { json(res, 404, { ok: false, error: 'GitHub connector is not configured' }); return; }
  const state = pending.create({ status: 'pending' });
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: githubRedirectUri(req),
    scope: SCOPE,
    state,
  });
  json(res, 200, { ok: true, state, authUrl: `https://github.com/login/oauth/authorize?${params.toString()}` });
}

// GET /api/connectors/github/callback — PUBLIC route, lands in the
// user's system browser, same reasoning as connector-oauth.js's Google
// callback (see oauth-pending-store.js's header comment).
async function handleGithubCallback(req, res) {
  if (!githubConnectorConfigured()) { html(res, 200, resultPage(false, 'The GitHub connector is not configured.')); return; }

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
    const tokenRes = await exchangeCode(code, githubRedirectUri(req));
    const user = await fetchGithubUser(tokenRes.access_token);
    pending.update(state, {
      status: 'ready',
      tokens: {
        accessToken: tokenRes.access_token,
        refreshToken: null, // classic OAuth App tokens do not expire and are not refreshed
        expiresAt: null,
        scope: tokenRes.scope || '',
        email: user.login ? `@${user.login}` : null,
      },
    });
    html(res, 200, resultPage(true, `Connected as ${user.login ? `@${user.login}` : 'your GitHub account'}. You can close this tab and return to Yana Desktop.`));
  } catch (err) {
    console.error('[github-oauth] callback failed:', err.message);
    pending.update(state, { status: 'error', error: 'exchange_failed' });
    html(res, 200, resultPage(false, 'Could not complete the connection. Close this tab and try again.'));
  }
}

// GET /api/connectors/github/pending/:state — one-time read, same
// contract as connector-oauth.js's handleConnectorGooglePending.
function handleGithubPending(req, res, state) {
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

// POST /api/connectors/github/revoke  { token }
async function handleGithubRevoke(req, res, body) {
  if (!githubConnectorConfigured()) { json(res, 404, { ok: false, error: 'GitHub connector is not configured' }); return; }
  const token = body && body.token;
  if (typeof token !== 'string' || !token) { json(res, 400, { ok: false, error: 'Missing token' }); return; }
  const revoked = await revokeGithubToken(token);
  json(res, 200, { ok: revoked });
}

module.exports = {
  SCOPE,
  githubConnectorConfigured,
  handleGithubStart,
  handleGithubCallback,
  handleGithubPending,
  handleGithubRevoke,
};

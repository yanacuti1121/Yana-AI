'use strict';
// Google OAuth for CONNECTORS (Gmail, Google Calendar) — deliberately
// separate from auth.js's login OAuth. Different purpose, different
// trust boundary:
//   - auth.js:            signs a person INTO this single-user Yana
//                          account. No refresh token needed (a session
//                          cookie is the whole point).
//   - this module:        gets Yana read access to a Google service on
//                          the user's behalf, for as long as the user
//                          keeps it connected. Needs a refresh token
//                          (access_type=offline + prompt=consent) and its
//                          own least-privilege scope per connector.
//
// Least privilege: each connector requests exactly the read-only scope
// it needs, nothing broader. This is intentionally NOT the same thing as
// connector-registry.js's local `mail.read`/`calendar.read` permissions
// (see rule that motivated this module — 68/local-permission docs):
//   - Google OAuth scope   = what Google allows THIS APP to do with the
//                            user's account at all.
//   - Yana local permission = what the USER additionally allows YANA
//                            ITSELF to do with that access, inside its
//                            own governance system.
// A user can grant the OAuth scope and still leave the Yana local
// permission off — the connector then shows "Connected" but Yana will
// not read from it until the local permission is also enabled. This
// module only ever touches the first gate.
//
// Token storage: NOT this module's job. Tokens are handed to the
// renderer exactly once (via the short-lived pending store below, over
// the same-origin /pending poll) and the renderer is the one that
// encrypts them into YanaVault (see desktop-src/lib/connector-credentials.mjs).
// This module never writes a token to disk and never logs one.
const { httpsJson } = require('./lib/https-json');
const { createPendingStore } = require('./lib/oauth-pending-store');

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const PENDING_TTL_MS       = 5 * 60_000; // long enough for the user to complete consent, no longer

// id here matches connector-registry.js's connector `name` field exactly,
// so the renderer can key off the same identifier everywhere.
const CONNECTOR_SCOPES = {
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
  'google-calendar': 'https://www.googleapis.com/auth/calendar.readonly',
};

const pending = createPendingStore(PENDING_TTL_MS);

function googleConnectorsConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function connectorRedirectUri(req) {
  // Same reasoning as auth.js's googleRedirectUri: this server picks a
  // fresh port every launch, so the redirect_uri must be derived from the
  // actual request rather than hardcoded — Google's "Desktop app" OAuth
  // client type accepts any loopback port for exactly this reason.
  const host = req.headers.host || '127.0.0.1';
  return `http://${host}/api/connectors/google/callback`;
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
  const body = new URLSearchParams({
    code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri, grant_type: 'authorization_code',
  }).toString();
  const { status, body: tokenRes } = await httpsJson({
    hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(body) },
  }, body);
  if (status !== 200 || !tokenRes.access_token) {
    throw new Error(`token_exchange_failed status=${status} error=${tokenRes.error || '?'} desc=${tokenRes.error_description || '?'}`);
  }
  return tokenRes;
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    refresh_token: refreshToken, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  }).toString();
  const { status, body: tokenRes } = await httpsJson({
    hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(body) },
  }, body);
  if (status !== 200 || !tokenRes.access_token) {
    throw new Error(`token_refresh_failed status=${status} error=${tokenRes.error || '?'}`);
  }
  return tokenRes; // access_token, expires_in — Google does not re-issue refresh_token here
}

async function fetchUserinfo(accessToken) {
  const { status, body: profile } = await httpsJson({
    hostname: 'www.googleapis.com', path: '/oauth2/v3/userinfo', method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (status !== 200) throw new Error(`userinfo_failed status=${status}`);
  return profile;
}

async function revokeToken(token) {
  // Google's revoke endpoint takes either an access or refresh token and
  // needs no client authentication — a plain POST is enough.
  const body = new URLSearchParams({ token }).toString();
  try {
    const { status } = await httpsJson({
      hostname: 'oauth2.googleapis.com', path: '/revoke', method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(body) },
    }, body);
    return status === 200;
  } catch (_) {
    return false;
  }
}

// GET /api/connectors/google/start?connector=gmail|google-calendar
// Wired into server.js's authenticated route section (below the top-level
// auth.isAuthed(req) gate every other /api/* route already relies on) —
// no separate isAuthed check needed here, matching that existing pattern.
// The callback below is the one exception, wired as a PUBLIC route,
// because it does not run in an authenticated request context at all
// (see oauth-pending-store.js's header comment).
function handleConnectorGoogleStart(req, res) {
  if (!googleConnectorsConfigured()) { json(res, 404, { ok: false, error: 'Google connectors are not configured' }); return; }

  let connector;
  try { connector = new URL(req.url, 'http://internal').searchParams.get('connector'); }
  catch (_) { json(res, 400, { ok: false, error: 'bad request' }); return; }

  const scope = CONNECTOR_SCOPES[connector];
  if (!scope) { json(res, 400, { ok: false, error: `unknown or unsupported connector: ${connector}` }); return; }

  const state = pending.create({ connector, status: 'pending' });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: connectorRedirectUri(req),
    response_type: 'code',
    scope,
    state,
    access_type: 'offline', // required to receive a refresh_token at all
    prompt: 'consent',      // required to receive one on a RE-connect too
  });
  json(res, 200, { ok: true, state, authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
}

// GET /api/connectors/google/callback — lands in the user's SYSTEM
// browser (see oauth-pending-store.js's header comment), not necessarily
// the Electron window that started the flow. No session cookie is
// assumed here; the state nonce is the only trust anchor.
async function handleConnectorGoogleCallback(req, res) {
  if (!googleConnectorsConfigured()) { html(res, 200, resultPage(false, 'Google connectors are not configured.')); return; }

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
    pending.update(state, { connector: record.connector, status: 'error', error: 'denied' });
    html(res, 200, resultPage(false, 'Connection was cancelled.'));
    return;
  }

  try {
    const tokenRes = await exchangeCode(code, connectorRedirectUri(req));
    const profile = await fetchUserinfo(tokenRes.access_token);
    pending.update(state, {
      connector: record.connector,
      status: 'ready',
      tokens: {
        accessToken: tokenRes.access_token,
        refreshToken: tokenRes.refresh_token || null,
        expiresAt: Date.now() + (Number(tokenRes.expires_in) || 3600) * 1000,
        scope: tokenRes.scope || '',
        email: profile.email || null,
      },
    });
    html(res, 200, resultPage(true, `Connected as ${profile.email || 'your Google account'}. You can close this tab and return to Yana Desktop.`));
  } catch (err) {
    console.error('[connector-oauth/google] callback failed:', err.message);
    pending.update(state, { connector: record.connector, status: 'error', error: 'exchange_failed' });
    html(res, 200, resultPage(false, 'Could not complete the connection. Close this tab and try again.'));
  }
}

// GET /api/connectors/google/pending/:state — the renderer polls this
// after opening authUrl. "ready" is a ONE-TIME read: the token bundle is
// deleted from server memory the instant it is handed off, so it is
// never sitting around waiting to be re-read.
function handleConnectorGooglePending(req, res, state) {
  const record = pending.peek(state);
  if (!record) { json(res, 404, { ok: false, error: 'not_found' }); return; }
  if (record.status === 'pending') { json(res, 200, { ok: true, status: 'pending' }); return; }
  if (record.status === 'error') {
    pending.consume(state);
    json(res, 200, { ok: true, status: 'error', error: record.error });
    return;
  }
  const data = pending.consume(state);
  json(res, 200, { ok: true, status: 'ready', connector: data.connector, tokens: data.tokens });
}

// POST /api/connectors/google/refresh  { refreshToken }
// The renderer calls this when a stored access token is expired (or a
// live API call 401s). Returns a fresh access token for it to fold back
// into YanaVault; the refresh token itself is not reissued by Google on
// this call and does not change.
async function handleConnectorGoogleRefresh(req, res, body) {
  if (!googleConnectorsConfigured()) { json(res, 404, { ok: false, error: 'Google connectors are not configured' }); return; }
  const refreshToken = body && body.refreshToken;
  if (typeof refreshToken !== 'string' || !refreshToken) { json(res, 400, { ok: false, error: 'Missing refreshToken' }); return; }
  try {
    const tokenRes = await refreshAccessToken(refreshToken);
    json(res, 200, {
      ok: true,
      accessToken: tokenRes.access_token,
      expiresAt: Date.now() + (Number(tokenRes.expires_in) || 3600) * 1000,
    });
  } catch (err) {
    console.error('[connector-oauth/google] refresh failed:', err.message);
    json(res, 200, { ok: false, error: 'refresh_failed' });
  }
}

// POST /api/connectors/google/revoke  { token }
// Best-effort: the renderer clears its local YanaVault entry regardless
// of whether this succeeds (see connector-credentials.mjs's disconnect).
async function handleConnectorGoogleRevoke(req, res, body) {
  const token = body && body.token;
  if (typeof token !== 'string' || !token) { json(res, 400, { ok: false, error: 'Missing token' }); return; }
  const revoked = await revokeToken(token);
  json(res, 200, { ok: revoked });
}

module.exports = {
  CONNECTOR_SCOPES,
  googleConnectorsConfigured,
  handleConnectorGoogleStart,
  handleConnectorGoogleCallback,
  handleConnectorGooglePending,
  handleConnectorGoogleRefresh,
  handleConnectorGoogleRevoke,
  // Exported for the /api/connectors/gmail|calendar route handlers to
  // call directly on a 401 (transparent refresh-and-retry-once), without
  // a second HTTP round-trip through handleConnectorGoogleRefresh.
  refreshAccessToken,
};

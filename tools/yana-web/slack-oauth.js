'use strict';
// Slack OAuth v2 for the "slack" connector — same lifecycle shape as
// github-oauth.js/notion-oauth.js (own client_id/secret, connector-oauth.js's
// shared pending-store CSRF pattern), with Slack's own real differences
// called out rather than assumed to match the others:
//
//   - Slack's Web API convention returns HTTP 200 on EVERY call, success
//     or failure — the real signal is the response body's `ok` boolean
//     and (on failure) an `error` string. This is unlike Google/GitHub/
//     Notion, which use HTTP status codes (401/etc) for auth failures.
//     Every function below checks `body.ok`, never `status !== 200` alone.
//   - No refresh token: like GitHub, a Slack bot token does not expire
//     unless the workspace has token rotation enabled (not requested
//     here) — no handleSlackRefresh exists for the same reason
//     github-oauth.js has none.
//   - A real revoke endpoint DOES exist here (auth.revoke), unlike
//     Notion which has none documented.
//   - Least privilege: `channels:read` only — enough for
//     connector-slack-adapter.js's one real call (conversations.list),
//     not the much broader `channels:history`/`chat:write` a bot
//     commonly requests.
const { httpsJson } = require('./lib/https-json');
const { createPendingStore } = require('./lib/oauth-pending-store');

const SLACK_CLIENT_ID     = process.env.SLACK_OAUTH_CLIENT_ID || '';
const SLACK_CLIENT_SECRET = process.env.SLACK_OAUTH_CLIENT_SECRET || '';
const PENDING_TTL_MS      = 5 * 60_000;
const SCOPE                = 'channels:read';

const pending = createPendingStore(PENDING_TTL_MS);

function slackConnectorConfigured() {
  return !!(SLACK_CLIENT_ID && SLACK_CLIENT_SECRET);
}

function slackRedirectUri(req) {
  const host = req.headers.host || '127.0.0.1';
  return `http://${host}/api/connectors/slack/callback`;
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
  const form = new URLSearchParams({
    code, client_id: SLACK_CLIENT_ID, client_secret: SLACK_CLIENT_SECRET, redirect_uri: redirectUri,
  }).toString();
  const { status, body: tokenRes } = await httpsJson({
    hostname: 'slack.com', path: '/api/oauth.v2.access', method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(form) },
  }, form);
  // Slack: HTTP 200 even on failure — `ok` is the real signal (see this
  // file's header comment).
  if (status !== 200 || !tokenRes.ok || !tokenRes.access_token) {
    throw new Error(`token_exchange_failed status=${status} error=${tokenRes.error || '?'}`);
  }
  return tokenRes;
}

async function revokeSlackToken(accessToken) {
  try {
    const { status, body } = await httpsJson({
      hostname: 'slack.com', path: '/api/auth.revoke', method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    return status === 200 && body.ok === true;
  } catch (_) {
    return false;
  }
}

// GET /api/connectors/slack/start
function handleSlackStart(req, res) {
  if (!slackConnectorConfigured()) { json(res, 404, { ok: false, error: 'Slack connector is not configured' }); return; }
  const state = pending.create({ status: 'pending' });
  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    redirect_uri: slackRedirectUri(req),
    scope: SCOPE,
    state,
  });
  json(res, 200, { ok: true, state, authUrl: `https://slack.com/oauth/v2/authorize?${params.toString()}` });
}

// GET /api/connectors/slack/callback — PUBLIC route, same reasoning as
// the other connectors' callbacks (oauth-pending-store.js's header
// comment: lands in the system browser, not necessarily an authenticated
// request).
async function handleSlackCallback(req, res) {
  if (!slackConnectorConfigured()) { html(res, 200, resultPage(false, 'The Slack connector is not configured.')); return; }

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
    const tokenRes = await exchangeCode(code, slackRedirectUri(req));
    pending.update(state, {
      status: 'ready',
      tokens: {
        accessToken: tokenRes.access_token,
        refreshToken: null, // Slack bot tokens do not expire without token rotation (not enabled here)
        expiresAt: null,
        teamName: tokenRes.team?.name || null,
        email: tokenRes.team?.name || null, // reused as the UI identity label, same convention as notion-oauth.js's workspaceName
      },
    });
    html(res, 200, resultPage(true, `Connected to ${tokenRes.team?.name || 'your Slack workspace'}. You can close this tab and return to Yana Desktop.`));
  } catch (err) {
    console.error('[slack-oauth] callback failed:', err.message);
    pending.update(state, { status: 'error', error: 'exchange_failed' });
    html(res, 200, resultPage(false, 'Could not complete the connection. Close this tab and try again.'));
  }
}

// GET /api/connectors/slack/pending/:state — one-time read, same
// contract as the other connectors' pending endpoints.
function handleSlackPending(req, res, state) {
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

// POST /api/connectors/slack/revoke  { token }
async function handleSlackRevoke(req, res, body) {
  if (!slackConnectorConfigured()) { json(res, 404, { ok: false, error: 'Slack connector is not configured' }); return; }
  const token = body && body.token;
  if (typeof token !== 'string' || !token) { json(res, 400, { ok: false, error: 'Missing token' }); return; }
  const revoked = await revokeSlackToken(token);
  json(res, 200, { ok: revoked });
}

module.exports = {
  SCOPE,
  slackConnectorConfigured,
  handleSlackStart,
  handleSlackCallback,
  handleSlackPending,
  handleSlackRevoke,
};

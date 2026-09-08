'use strict';
// Real Slack read adapter — actual call to Slack's Web API
// (conversations.list), not placeholder data. Same trust shape as the
// other connector adapters: the access token arrives per-request from
// the renderer (decrypted from YanaVault), this module never stores one.
//
// Slack's Web API convention: HTTP 200 on every call, success or
// failure — the real signal is the response body's `ok` boolean and (on
// failure) an `error` string like "invalid_auth"/"token_revoked". This
// module maps those specific errors to `expired: true`, matching the
// `{ ok: false, expired: true }` contract server.js's
// connectorFetchWithRefresh already expects from every adapter — Slack
// just reaches that state via a body field instead of a 401 status.
const { httpsJson } = require('./lib/https-json');

const SLACK_CHANNEL_LIMIT_MAX = 25;
const AUTH_ERROR_CODES = new Set(['invalid_auth', 'token_revoked', 'account_inactive', 'not_authed']);

async function fetchSlackChannels({ accessToken, limit = 10, requestJson = httpsJson }) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 10, SLACK_CHANNEL_LIMIT_MAX));
  const params = new URLSearchParams({ types: 'public_channel', limit: String(boundedLimit), exclude_archived: 'true' });
  const result = await requestJson({
    hostname: 'slack.com', path: `/api/conversations.list?${params.toString()}`, method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (result.status !== 200) return { ok: false, error: `slack_list_failed status=${result.status}` };
  if (!result.body.ok) {
    if (AUTH_ERROR_CODES.has(result.body.error)) return { ok: false, expired: true };
    return { ok: false, error: `slack_list_failed error=${result.body.error || '?'}` };
  }

  const channels = Array.isArray(result.body.channels) ? result.body.channels.map((item) => ({
    id: item.id,
    name: item.name ? `#${item.name}` : '(unnamed)',
    numMembers: Number.isInteger(item.num_members) ? item.num_members : null,
    topic: item.topic?.value || '',
  })) : [];

  return { ok: true, channels };
}

module.exports = { fetchSlackChannels };

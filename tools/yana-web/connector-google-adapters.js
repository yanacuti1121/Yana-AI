'use strict';
// Real Gmail + Google Calendar read adapters — actual calls to Google's
// REST APIs, not placeholder data. Counterpart to connector.rs's
// DEFINITIONS table, where gmail/google-calendar currently have
// `adapter_installed: false`; this is the JS-side adapter implementation
// hướng B chose to keep OUTSIDE the Rust runtime (see connector-oauth.js's
// header comment for why: token storage lives in the renderer's YanaVault,
// not Rust's SecretBackend, so the calls that use those tokens live here
// too, alongside the existing /api/chat provider-proxy pattern this
// server already uses).
//
// Tokens arrive per-request from the renderer (which decrypted them from
// YanaVault) — this module never stores a token itself, matching how
// /api/chat already receives a provider apiKey per-request rather than
// holding one server-side.
const { httpsJson } = require('./lib/https-json');

const GMAIL_MESSAGE_LIMIT_MAX = 25;
const CALENDAR_EVENT_LIMIT_MAX = 25;

function authedGet(hostname, path, accessToken, requestJson) {
  return requestJson({
    hostname, path, method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

function headerValue(headers, name) {
  const match = Array.isArray(headers) ? headers.find((h) => h.name?.toLowerCase() === name) : null;
  return match ? match.value : '';
}

// Gmail's list endpoint only returns message ids — each message's real
// subject/from/snippet needs its own metadata fetch. Batched with
// Promise.all and capped at GMAIL_MESSAGE_LIMIT_MAX to keep this a bounded,
// predictable number of requests per call, not an unbounded fan-out.
async function fetchGmailMessages({ accessToken, limit = 10, requestJson = httpsJson }) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 10, GMAIL_MESSAGE_LIMIT_MAX));
  const list = await authedGet(
    'gmail.googleapis.com',
    `/gmail/v1/users/me/messages?maxResults=${boundedLimit}`,
    accessToken, requestJson,
  );
  if (list.status === 401) return { ok: false, expired: true };
  if (list.status !== 200) return { ok: false, error: `gmail_list_failed status=${list.status}` };

  const ids = Array.isArray(list.body.messages) ? list.body.messages.map((m) => m.id) : [];
  const details = await Promise.all(ids.map((id) => authedGet(
    'gmail.googleapis.com',
    `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    accessToken, requestJson,
  )));

  const messages = details
    .filter((r) => r.status === 200)
    .map((r) => ({
      id: r.body.id,
      threadId: r.body.threadId,
      subject: headerValue(r.body.payload?.headers, 'subject') || '(no subject)',
      from: headerValue(r.body.payload?.headers, 'from') || '',
      date: headerValue(r.body.payload?.headers, 'date') || '',
      snippet: typeof r.body.snippet === 'string' ? r.body.snippet : '',
      unread: Array.isArray(r.body.labelIds) && r.body.labelIds.includes('UNREAD'),
    }));

  return { ok: true, messages };
}

async function fetchCalendarEvents({ accessToken, limit = 10, requestJson = httpsJson }) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 10, CALENDAR_EVENT_LIMIT_MAX));
  const timeMin = encodeURIComponent(new Date().toISOString());
  const result = await authedGet(
    'www.googleapis.com',
    `/calendar/v3/calendars/primary/events?maxResults=${boundedLimit}&orderBy=startTime&singleEvents=true&timeMin=${timeMin}`,
    accessToken, requestJson,
  );
  if (result.status === 401) return { ok: false, expired: true };
  if (result.status !== 200) return { ok: false, error: `calendar_list_failed status=${result.status}` };

  const events = Array.isArray(result.body.items) ? result.body.items.map((item) => ({
    id: item.id,
    summary: item.summary || '(no title)',
    start: item.start?.dateTime || item.start?.date || null,
    end: item.end?.dateTime || item.end?.date || null,
    location: item.location || '',
    htmlLink: item.htmlLink || '',
  })) : [];

  return { ok: true, events };
}

module.exports = { fetchGmailMessages, fetchCalendarEvents };

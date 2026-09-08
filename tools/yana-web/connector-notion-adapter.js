'use strict';
// Real Notion read adapter — actual call to Notion's REST API, not
// placeholder data. Same trust shape as connector-google-adapters.js:
// the access token arrives per-request from the renderer (decrypted from
// YanaVault), this module never stores one itself.
const { httpsJson } = require('./lib/https-json');
const { NOTION_VERSION } = require('./notion-oauth');

const NOTION_PAGE_LIMIT_MAX = 25;

// POST /v1/search with an empty query returns everything the integration
// was granted access to in Notion's own page-picker (see notion-oauth.js's
// header comment: there is no OAuth scope string, access is picker-based),
// sorted newest-edited-first — the same "recent items" shape Gmail/
// Calendar/Drive's previews already use.
async function fetchNotionPages({ accessToken, limit = 10, requestJson = httpsJson }) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 10, NOTION_PAGE_LIMIT_MAX));
  const requestBody = JSON.stringify({
    page_size: boundedLimit,
    sort: { direction: 'descending', timestamp: 'last_edited_time' },
  });
  const result = await requestJson({
    hostname: 'api.notion.com', path: '/v1/search', method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(requestBody),
    },
  }, requestBody);

  if (result.status === 401) return { ok: false, expired: true };
  if (result.status !== 200) return { ok: false, error: `notion_search_failed status=${result.status}` };

  const items = Array.isArray(result.body.results) ? result.body.results.map((item) => ({
    id: item.id,
    // A page's own title lives in whichever property has type "title"
    // (its name varies per database schema); a database's title is its
    // own top-level `title` rich-text array. Neither is a fixed key name,
    // so both shapes are checked rather than assuming "Name"/"title".
    name: extractTitle(item) || '(untitled)',
    object: item.object || 'page',
    url: item.url || '',
    lastEditedTime: item.last_edited_time || null,
  })) : [];

  return { ok: true, pages: items };
}

function extractTitle(item) {
  if (item.object === 'database' && Array.isArray(item.title)) {
    return item.title.map((t) => t.plain_text || '').join('').trim() || null;
  }
  const properties = item.properties || {};
  const titleProp = Object.values(properties).find((p) => p && p.type === 'title');
  if (titleProp && Array.isArray(titleProp.title)) {
    return titleProp.title.map((t) => t.plain_text || '').join('').trim() || null;
  }
  return null;
}

module.exports = { fetchNotionPages };

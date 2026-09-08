'use strict';
// Real Canva read adapter — actual call to the Connect API's List
// designs endpoint, not placeholder data. Same trust shape as the other
// connector adapters: the access token arrives per-request from the
// renderer (decrypted from YanaVault), this module never stores one.
const { httpsJson } = require('./lib/https-json');

const CANVA_DESIGN_LIMIT_MAX = 25;

async function fetchCanvaDesigns({ accessToken, limit = 10, requestJson = httpsJson }) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 10, CANVA_DESIGN_LIMIT_MAX));
  const params = new URLSearchParams({ limit: String(boundedLimit), ownership: 'owned', sort_by: 'modified_descending' });
  const result = await requestJson({
    hostname: 'api.canva.com', path: `/rest/v1/designs?${params.toString()}`, method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (result.status === 401) return { ok: false, expired: true };
  if (result.status !== 200) return { ok: false, error: `canva_list_failed status=${result.status}` };

  const items = Array.isArray(result.body.items) ? result.body.items.map((item) => ({
    id: item.id,
    title: item.title || '(untitled)',
    urls: item.urls || {},
    thumbnail: item.thumbnail?.url || '',
    updatedAt: Number.isInteger(item.updated_at) ? item.updated_at * 1000 : null,
  })) : [];

  return { ok: true, designs: items };
}

module.exports = { fetchCanvaDesigns };

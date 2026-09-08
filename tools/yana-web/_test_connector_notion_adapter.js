'use strict';
// Tests for connector-notion-adapter.js's data-shaping logic, using a fake
// requestJson (same dependency-injected pattern as
// _test_connector_google_adapters.js) — no real network call, no live
// Notion credentials needed. What this does NOT cover: whether the real
// Notion /v1/search endpoint actually responds the way these fixtures
// assume — that only a live, logged-in run can confirm.
// Run: node _test_connector_notion_adapter.js   (exit 0 = pass, 1 = fail)

const { fetchNotionPages } = require('./connector-notion-adapter');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else      { fail++; console.log('FAIL  ' + name); }
}

async function run() {
  // ── happy path: a page (title in a "title"-type property) + a database ──
  {
    let seenHeaders = null;
    const fakeRequest = async (options) => {
      seenHeaders = options.headers;
      return {
        status: 200,
        body: {
          results: [
            {
              id: 'p1', object: 'page', url: 'https://notion.so/p1', last_edited_time: '2026-09-01T09:00:00Z',
              properties: { Name: { type: 'title', title: [{ plain_text: 'Q3 ' }, { plain_text: 'Plan' }] } },
            },
            {
              id: 'd1', object: 'database', url: 'https://notion.so/d1', last_edited_time: '2026-08-30T00:00:00Z',
              title: [{ plain_text: 'Roadmap' }],
            },
            { id: 'p2', object: 'page', properties: {} }, // no title property at all
          ],
        },
      };
    };
    const result = await fetchNotionPages({ accessToken: 'tok', limit: 5, requestJson: fakeRequest });
    t('ok=true on 200', result.ok === true);
    t('returns all three items', result.pages.length === 3);
    t('page title assembled from title-type property rich text', result.pages[0].name === 'Q3 Plan');
    t('database title read from its own top-level title array', result.pages[1].name === 'Roadmap');
    t('missing title does not crash, gets a placeholder', result.pages[2].name === '(untitled)');
    t('sends the required Notion-Version header', seenHeaders['Notion-Version'] === '2022-06-28');
    t('sends a Bearer auth header', seenHeaders.authorization === 'Bearer tok');
  }

  // ── expired token ────────────────────────────────────────────────────────
  {
    const result = await fetchNotionPages({ accessToken: 'stale', requestJson: async () => ({ status: 401, body: {} }) });
    t('401 reports expired, not a generic error', result.ok === false && result.expired === true);
  }

  // ── limit is bounded, never trusts caller's raw number ──────────────────
  {
    let seenBody = null;
    const fakeRequest = async (options, body) => { seenBody = JSON.parse(body); return { status: 200, body: { results: [] } }; };
    await fetchNotionPages({ accessToken: 'tok', limit: 9999, requestJson: fakeRequest });
    t('absurd limit is clamped to the max, not passed through', seenBody.page_size === 25);
  }

  // ── never throws on a malformed upstream body ───────────────────────────
  {
    const result = await fetchNotionPages({ accessToken: 'tok', requestJson: async () => ({ status: 200, body: {} }) });
    t('missing "results" key returns empty list, not a crash', result.ok === true && result.pages.length === 0);
  }

  console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

run().catch((err) => { console.error('UNCAUGHT', err); process.exit(1); });

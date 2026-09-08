'use strict';
// Tests for connector-canva-adapter.js's data-shaping logic, using a fake
// requestJson (same dependency-injected pattern as the other connector
// adapter tests) — no real network call, no live Canva credentials
// needed.
// Run: node _test_connector_canva_adapter.js   (exit 0 = pass, 1 = fail)

const { fetchCanvaDesigns } = require('./connector-canva-adapter');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else      { fail++; console.log('FAIL  ' + name); }
}

async function run() {
  // ── happy path ───────────────────────────────────────────────────────────
  {
    let seenPath = '';
    const fakeRequest = async (options) => {
      seenPath = options.path;
      return {
        status: 200,
        body: {
          items: [
            { id: 'd1', title: 'Launch poster', urls: { view_url: 'https://canva.com/d1' }, thumbnail: { url: 'https://thumb/d1' }, updated_at: 1756713600 },
            { id: 'd2' }, // no title/urls/thumbnail/updated_at
          ],
        },
      };
    };
    const result = await fetchCanvaDesigns({ accessToken: 'tok', limit: 5, requestJson: fakeRequest });
    t('ok=true on 200', result.ok === true);
    t('returns both designs', result.designs.length === 2);
    t('title/url/thumbnail carried through', result.designs[0].title === 'Launch poster' && result.designs[0].urls.view_url === 'https://canva.com/d1');
    t('unix-seconds updated_at converted to ms', result.designs[0].updatedAt === 1756713600 * 1000);
    t('missing title does not crash, gets a placeholder', result.designs[1].title === '(untitled)');
    t('missing updated_at stays null, not NaN', result.designs[1].updatedAt === null);
    t('limit is capped into the list request', seenPath.includes('limit=5'));
  }

  // ── expired token ────────────────────────────────────────────────────────
  {
    const result = await fetchCanvaDesigns({ accessToken: 'stale', requestJson: async () => ({ status: 401, body: {} }) });
    t('401 reports expired, not a generic error', result.ok === false && result.expired === true);
  }

  // ── limit is bounded, never trusts caller's raw number ──────────────────
  {
    let seenPath = '';
    const fakeRequest = async (options) => { seenPath = options.path; return { status: 200, body: { items: [] } }; };
    await fetchCanvaDesigns({ accessToken: 'tok', limit: 9999, requestJson: fakeRequest });
    t('absurd limit is clamped to the max, not passed through', seenPath.includes('limit=25'));
  }

  // ── never throws on a malformed upstream body ────────────────────────────
  {
    const result = await fetchCanvaDesigns({ accessToken: 'tok', requestJson: async () => ({ status: 200, body: {} }) });
    t('missing "items" key returns empty list, not a crash', result.ok === true && result.designs.length === 0);
  }

  console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

run().catch((err) => { console.error('UNCAUGHT', err); process.exit(1); });

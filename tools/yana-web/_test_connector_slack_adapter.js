'use strict';
// Tests for connector-slack-adapter.js's data-shaping logic, using a fake
// requestJson (same dependency-injected pattern as the other connector
// adapter tests) — no real network call, no live Slack credentials
// needed. Slack's own HTTP-200-always convention (see the adapter's
// header comment) is exercised directly here since it's the one real
// behavioral difference from the other three adapters.
// Run: node _test_connector_slack_adapter.js   (exit 0 = pass, 1 = fail)

const { fetchSlackChannels } = require('./connector-slack-adapter');

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
          ok: true,
          channels: [
            { id: 'c1', name: 'general', num_members: 12, topic: { value: 'Company-wide' } },
            { id: 'c2', num_members: 0 }, // no name, no topic
          ],
        },
      };
    };
    const result = await fetchSlackChannels({ accessToken: 'tok', limit: 5, requestJson: fakeRequest });
    t('ok=true on 200 with ok:true body', result.ok === true);
    t('returns both channels', result.channels.length === 2);
    t('channel name gets a # prefix', result.channels[0].name === '#general');
    t('missing name does not crash, gets a placeholder', result.channels[1].name === '(unnamed)');
    t('limit is capped into the list request', seenPath.includes('limit=5'));
  }

  // ── Slack's own failure convention: HTTP 200, body.ok=false ─────────────
  {
    const result = await fetchSlackChannels({ accessToken: 'stale', requestJson: async () => ({ status: 200, body: { ok: false, error: 'invalid_auth' } }) });
    t('invalid_auth (HTTP 200, ok:false) maps to expired, not a generic error', result.ok === false && result.expired === true);
  }
  {
    const result = await fetchSlackChannels({ accessToken: 'stale', requestJson: async () => ({ status: 200, body: { ok: false, error: 'token_revoked' } }) });
    t('token_revoked also maps to expired', result.ok === false && result.expired === true);
  }
  {
    const result = await fetchSlackChannels({ accessToken: 'tok', requestJson: async () => ({ status: 200, body: { ok: false, error: 'ratelimited' } }) });
    t('a non-auth Slack error is NOT reported as expired', result.ok === false && result.expired !== true);
  }

  // ── real HTTP failure (rare for Slack, but must not crash) ──────────────
  {
    const result = await fetchSlackChannels({ accessToken: 'tok', requestJson: async () => ({ status: 500, body: {} }) });
    t('non-200 HTTP status is a plain error, not expired', result.ok === false && result.expired !== true);
  }

  // ── limit is bounded, never trusts caller's raw number ──────────────────
  {
    let seenPath = '';
    const fakeRequest = async (options) => { seenPath = options.path; return { status: 200, body: { ok: true, channels: [] } }; };
    await fetchSlackChannels({ accessToken: 'tok', limit: 9999, requestJson: fakeRequest });
    t('absurd limit is clamped to the max, not passed through', seenPath.includes('limit=25'));
  }

  // ── never throws on a malformed upstream body ────────────────────────────
  {
    const result = await fetchSlackChannels({ accessToken: 'tok', requestJson: async () => ({ status: 200, body: { ok: true } }) });
    t('missing "channels" key returns empty list, not a crash', result.ok === true && result.channels.length === 0);
  }

  console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

run().catch((err) => { console.error('UNCAUGHT', err); process.exit(1); });

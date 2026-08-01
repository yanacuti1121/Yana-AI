'use strict';
// Tests for the provider circuit breaker + fallback chain builder.
// Run: node _test_provider_failover.js
const { CircuitBreaker, buildFallbackChain, OPENAI_SHAPE_PROVIDERS, STATE } = require('./lib/provider-failover');

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.error('FAIL:', name); }
}

// ── CircuitBreaker ──────────────────────────────────────────────────────────

// 1. Starts CLOSED and attemptable.
{
  const cb = new CircuitBreaker();
  check('new provider starts CLOSED', cb.getState('groq') === STATE.CLOSED);
  check('CLOSED provider is attemptable', cb.canAttempt('groq') === true);
}

// 2. 5 consecutive failures trips the circuit to OPEN.
{
  const cb = new CircuitBreaker();
  for (let i = 0; i < 4; i++) cb.recordFailure('groq');
  check('4 failures still CLOSED', cb.getState('groq') === STATE.CLOSED);
  cb.recordFailure('groq');
  check('5th consecutive failure trips to OPEN', cb.getState('groq') === STATE.OPEN);
  check('OPEN circuit is not attemptable (before cooldown)', cb.canAttempt('groq', Date.now()) === false);
}

// 3. A success before reaching the failure threshold resets the counter
// (not just a raw count — genuinely consecutive).
{
  const cb = new CircuitBreaker();
  for (let i = 0; i < 4; i++) cb.recordFailure('groq');
  cb.recordSuccess('groq');
  for (let i = 0; i < 4; i++) cb.recordFailure('groq');
  check('failure count resets on success (9 failures with a success in the middle stays CLOSED)', cb.getState('groq') === STATE.CLOSED);
}

// 4. Cooldown expiry transitions OPEN -> HALF_OPEN and allows one probe.
{
  const cb = new CircuitBreaker();
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) cb.recordFailure('groq', t0);
  check('OPEN immediately after tripping', cb.getState('groq') === STATE.OPEN);
  check('still blocked mid-cooldown', cb.canAttempt('groq', t0 + 30_000) === false);
  const attemptable = cb.canAttempt('groq', t0 + 61_000); // just past the 60s initial cooldown
  check('attemptable once cooldown elapses', attemptable === true);
  check('state is HALF_OPEN after cooldown elapses', cb.getState('groq') === STATE.HALF_OPEN);
}

// 5. A successful HALF_OPEN probe resets fully to CLOSED.
{
  const cb = new CircuitBreaker();
  const t0 = 2_000_000;
  for (let i = 0; i < 5; i++) cb.recordFailure('groq', t0);
  cb.canAttempt('groq', t0 + 61_000); // trigger HALF_OPEN
  cb.recordSuccess('groq');
  check('successful probe resets to CLOSED', cb.getState('groq') === STATE.CLOSED);
  check('canAttempt true immediately after reset', cb.canAttempt('groq', t0 + 61_000) === true);
}

// 6. A failed HALF_OPEN probe re-opens with escalated (x5) backoff, capped.
{
  const cb = new CircuitBreaker();
  const t0 = 3_000_000;
  for (let i = 0; i < 5; i++) cb.recordFailure('groq', t0);
  cb.canAttempt('groq', t0 + 61_000); // -> HALF_OPEN
  cb.recordFailure('groq', t0 + 61_000); // probe fails -> re-OPEN, backoff x5 = 300s
  check('failed probe re-opens the circuit', cb.getState('groq') === STATE.OPEN);
  check('still blocked at 61s + 100s (< escalated 300s cooldown)', cb.canAttempt('groq', t0 + 61_000 + 100_000) === false);
  check('attemptable again once the escalated cooldown elapses', cb.canAttempt('groq', t0 + 61_000 + 301_000) === true);
}

// 7. Backoff escalation caps at 1800s and does not grow unbounded.
{
  const cb = new CircuitBreaker();
  let t = 4_000_000;
  for (let i = 0; i < 5; i++) cb.recordFailure('groq', t); // trip #1: 60s
  for (let round = 0; round < 6; round++) {
    // find the current cooldown boundary and fail the probe again
    t += 2_000_000; // comfortably past any cooldown seen so far
    cb.canAttempt('groq', t);       // -> HALF_OPEN
    cb.recordFailure('groq', t);    // probe fails -> escalate
  }
  // after 6 escalations from 60s (x5 each): 60*5^6 would be huge — must be capped at 1800s
  const stillBlockedJustAfter = cb.canAttempt('groq', t + 1_700_000); // just under 1800s
  const openAfterCap = cb.canAttempt('groq', t + 1_801_000); // just over 1800s cap
  check('escalation caps at 1800s (blocked just under cap)', stillBlockedJustAfter === false);
  check('escalation caps at 1800s (attemptable just over cap)', openAfterCap === true);
}

// 8. Independent providers have independent circuit state.
{
  const cb = new CircuitBreaker();
  for (let i = 0; i < 5; i++) cb.recordFailure('groq');
  check('groq is OPEN', cb.getState('groq') === STATE.OPEN);
  check('openai is untouched and CLOSED', cb.getState('openai') === STATE.CLOSED);
  check('openai is still attemptable', cb.canAttempt('openai') === true);
}

// ── buildFallbackChain ──────────────────────────────────────────────────────

// 9. No fallbackApiKeys supplied -> chain of exactly one (the primary).
// This is the strict-no-op case for every existing caller.
{
  const chain = buildFallbackChain('groq', 'primary-key', undefined);
  check('no fallback keys -> single-candidate chain', chain.length === 1);
  check('single candidate is the primary', chain[0].providerKey === 'groq' && chain[0].apiKey === 'primary-key');
}

// 10. fallbackApiKeys supplied for a non-same-shape primary (e.g. anthropic)
// -> still single-candidate (no safe same-shape target for a non-OpenAI-shape primary).
{
  const chain = buildFallbackChain('anthropic', 'claude-key', { groq: 'groq-key', openai: 'openai-key' });
  check('non-OpenAI-shape primary ignores fallbackApiKeys', chain.length === 1 && chain[0].providerKey === 'anthropic');
}

// 11. fallbackApiKeys supplied for a same-shape primary -> ordered chain,
// primary first, then OPENAI_SHAPE_PROVIDERS order, skipping the primary
// itself and any provider without a supplied key.
{
  const fallbackApiKeys = { openai: 'k-openai', xai: 'k-xai' }; // note: not in OPENAI_SHAPE_PROVIDERS order
  const chain = buildFallbackChain('groq', 'k-groq', fallbackApiKeys);
  const keys = chain.map(c => c.providerKey);
  check('primary first', keys[0] === 'groq');
  check('remaining candidates follow OPENAI_SHAPE_PROVIDERS fixed order (openai before xai)', keys.indexOf('openai') < keys.indexOf('xai'));
  check('providers without a supplied key are excluded (openrouter, deepseek absent)', !keys.includes('openrouter') && !keys.includes('deepseek'));
  check('chain length matches primary + 2 supplied fallback keys', chain.length === 3);
  const openaiEntry = chain.find(c => c.providerKey === 'openai');
  check('each candidate carries its own supplied key, not the primary key', openaiEntry.apiKey === 'k-openai');
}

// 12. Empty-string or non-string fallback key values are rejected (not
// silently included as a usable candidate).
{
  const chain = buildFallbackChain('groq', 'k-groq', { openai: '', xai: 123, openrouter: 'k-real' });
  const keys = chain.map(c => c.providerKey);
  check('empty-string key excluded', !keys.includes('openai'));
  check('non-string key excluded', !keys.includes('xai'));
  check('valid string key included', keys.includes('openrouter'));
}

// 13. fallbackApiKeys that isn't a plain object (array, string, number) is
// ignored rather than throwing.
{
  const chain1 = buildFallbackChain('groq', 'k', 'not-an-object');
  const chain2 = buildFallbackChain('groq', 'k', ['also', 'not', 'an', 'object']);
  check('non-object fallbackApiKeys (string) does not throw and yields single-candidate chain', chain1.length === 1);
  check('array fallbackApiKeys does not throw and yields single-candidate chain', chain2.length === 1);
}

// 14. Sanity: the exported provider list matches what server.js relies on.
check('OPENAI_SHAPE_PROVIDERS has the 5 expected same-shape providers', OPENAI_SHAPE_PROVIDERS.length === 5);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('All provider-failover tests passed.');

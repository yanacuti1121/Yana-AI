'use strict';
// Tests for the streaming output scrubber (secret/PII redaction).
// Run: node _test_output_scrubber.js
const { OutputScrubber, HOLD_BACK_WINDOW } = require('./lib/output-scrubber');

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.error('FAIL:', name); }
}

function collectAll(scrubber, chunks) {
  let text = '';
  let blocked = false;
  let blockedLabel = null;
  for (const c of chunks) {
    const r = scrubber.feed(c);
    text += r.text;
    if (r.blocked) { blocked = true; blockedLabel = r.blockedLabel; break; }
  }
  if (!blocked) {
    const r = scrubber.flush();
    text += r.text;
    if (r.blocked) { blocked = true; blockedLabel = r.blockedLabel; }
  }
  return { text, blocked, blockedLabel };
}

// 1. Ordinary text passes through completely unchanged.
{
  const s = new OutputScrubber();
  const input = 'Yana AI is an agent operating system for Claude Code.';
  const r = collectAll(s, [input]);
  check('ordinary text unchanged', r.text === input && !r.blocked);
}

// 2. Ordinary text split across many small chunks still reassembles exactly
// (proves the hold-back window doesn't corrupt/drop non-matching text).
{
  const s = new OutputScrubber();
  const input = 'The quick brown fox jumps over the lazy dog. '.repeat(5);
  const chunks = input.match(/.{1,7}/g); // arbitrary small chunk boundaries
  const r = collectAll(s, chunks);
  check('chunked ordinary text reassembles exactly', r.text === input && !r.blocked);
}

// 3. A hard-block secret entirely within one chunk aborts the response.
{
  const s = new OutputScrubber();
  const r = collectAll(s, ['here is a key: AKIA1234567890ABCDEF end']);
  check('AWS key in one chunk blocks', r.blocked === true && r.blockedLabel === 'aws-key');
  check('blocked response emits no text', r.text === '');
}

// 4. The same secret, but SPLIT ACROSS TWO CHUNKS at the exact midpoint of
// the pattern — the one real thing a naive non-sliding-window scan would
// miss. This is the load-bearing test for the whole hold-back design.
{
  const s = new OutputScrubber();
  const secret = 'AKIA1234567890ABCDEF';
  const mid = Math.floor(secret.length / 2);
  const chunk1 = 'preamble text ' + secret.slice(0, mid);
  const chunk2 = secret.slice(mid) + ' trailing text';
  const r = collectAll(s, [chunk1, chunk2]);
  check('AWS key split across chunk boundary still blocks', r.blocked === true && r.blockedLabel === 'aws-key');
}

// 5. A private-key PEM header split across chunks also blocks.
{
  const s = new OutputScrubber();
  const header = '-----BEGIN RSA PRIVATE KEY-----';
  const mid = 15;
  const r = collectAll(s, [header.slice(0, mid), header.slice(mid)]);
  check('PEM header split across chunk boundary still blocks', r.blocked === true && r.blockedLabel === 'private-key');
}

// 6. PII (email) redacts in place; streaming continues (not blocked).
{
  const s = new OutputScrubber();
  const r = collectAll(s, ['Contact me at test+alice@example.com for details.']);
  check('email is redacted, not blocked', !r.blocked && r.text.includes('[REDACTED:email]'));
  check('email redaction does not leak the raw address', !r.text.includes('test+alice@example.com'));
}

// 7. PII split across chunks is still redacted (same hold-back mechanism).
{
  const s = new OutputScrubber();
  const email = 'someone@example.com';
  const mid = 8;
  const r = collectAll(s, ['reach ' + email.slice(0, mid), email.slice(mid) + ' now']);
  check('split email is still redacted', !r.blocked && r.text.includes('[REDACTED:email]') && !r.text.includes(email));
}

// 8. A phone-shaped number redacts without blocking (lower-confidence tier).
{
  const s = new OutputScrubber();
  const r = collectAll(s, ['Call us at (555) 123-4567 anytime.']);
  check('phone number redacted, not blocked', !r.blocked && r.text.includes('[REDACTED:phone]'));
}

// 9. Sanity: HOLD_BACK_WINDOW is large enough to cover the longest fixed
// pattern (github_pat_ + 82 chars = 92) with margin.
check('HOLD_BACK_WINDOW covers the longest known pattern', HOLD_BACK_WINDOW >= 92);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('All output-scrubber tests passed.');

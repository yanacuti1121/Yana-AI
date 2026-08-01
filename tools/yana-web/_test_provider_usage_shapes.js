'use strict';
// Tests for the provider-native usage-object normalization added for
// Anthropic + Gemini token metering (Phase A2,
// docs/Yana-AI-Danh-gia-Kien-truc-Bao-mat.md section 2.1).
//
// server.js's PROVIDERS table and pipeNormalizedSSE/emitLines are not
// requireable in isolation — server.js calls server.listen() at module
// load with no require.main guard, so `require('./server')` from a test
// file would bind a real port as a side effect. Gating that is a real,
// separate improvement, out of scope for this change. Instead, the two
// functions under test here are literal copies of what's in server.js —
// kept in sync by hand, same pattern already used by
// lib/output-scrubber.js's own header comment for its hand-ported
// regexes. Re-copy from server.js if either provider's extractUsage
// changes.
//
// Run: node _test_provider_usage_shapes.js

// Copied from server.js PROVIDERS.anthropic.extractUsage (~line 103).
function anthropicExtractUsage(evt) {
  if (evt?.type === 'message_start' && evt.message?.usage) {
    const u = evt.message.usage;
    return { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0 };
  }
  if (evt?.type === 'message_delta' && evt.usage) {
    return { output_tokens: evt.usage.output_tokens || 0 };
  }
  return null;
}

// Copied from server.js PROVIDERS.gemini.extractUsage (~line 294).
function geminiExtractUsage(evt) {
  return evt?.usageMetadata
    ? { input_tokens: evt.usageMetadata.promptTokenCount || 0, output_tokens: evt.usageMetadata.candidatesTokenCount || 0 }
    : null;
}

// Copied from any OpenAI-shape provider's extractUsage, e.g. groq (~line 125).
function openaiShapeExtractUsage(evt) {
  return evt?.usage
    ? { input_tokens: evt.usage.prompt_tokens || 0, output_tokens: evt.usage.completion_tokens || 0 }
    : null;
}

// The merge behavior added to pipeNormalizedSSE/emitLines: `usage = {
// ...usage, ...u }` instead of `usage = u`. Trivial (built-in spread),
// but the sequence tests below prove it actually reassembles Anthropic's
// split usage correctly, which is the property that matters.
function mergeUsage(prev, next) {
  return { ...prev, ...next };
}

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.error('FAIL:', name); }
}
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ── Anthropic ────────────────────────────────────────────────────────────

// 1. message_start alone gives input_tokens + a placeholder output_tokens.
{
  const evt = { type: 'message_start', message: { usage: { input_tokens: 25, output_tokens: 1 } } };
  check('message_start extracts input_tokens + placeholder output_tokens',
    deepEqual(anthropicExtractUsage(evt), { input_tokens: 25, output_tokens: 1 }));
}

// 2. message_delta alone gives only output_tokens (no input_tokens field
// in the real event — this is exactly the case the merge fix exists for).
{
  const evt = { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 45 } };
  check('message_delta extracts only output_tokens',
    deepEqual(anthropicExtractUsage(evt), { output_tokens: 45 }));
}

// 3. The full realistic sequence: message_start then message_delta,
// merged, must preserve input_tokens from the first and take
// output_tokens from the second (not silently drop input_tokens).
{
  const startEvt = { type: 'message_start', message: { usage: { input_tokens: 25, output_tokens: 1 } } };
  const deltaEvt  = { type: 'message_delta', usage: { output_tokens: 45 } };
  let usage = null;
  const u1 = anthropicExtractUsage(startEvt);
  if (u1) usage = mergeUsage(usage, u1);
  const u2 = anthropicExtractUsage(deltaEvt);
  if (u2) usage = mergeUsage(usage, u2);
  check('merged Anthropic sequence keeps input_tokens from message_start and output_tokens from message_delta',
    deepEqual(usage, { input_tokens: 25, output_tokens: 45 }));
}

// 4. Irrelevant event types (e.g. content_block_delta, the actual text
// stream) produce no usage and don't disturb accumulated state.
{
  const textEvt = { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } };
  check('non-usage event type returns null', anthropicExtractUsage(textEvt) === null);
}

// ── Gemini ───────────────────────────────────────────────────────────────

// 5. A single chunk with usageMetadata extracts directly.
{
  const evt = { usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 12, totalTokenCount: 42 } };
  check('gemini usageMetadata extracts input/output tokens',
    deepEqual(geminiExtractUsage(evt), { input_tokens: 30, output_tokens: 12 }));
}

// 6. Cumulative resends across multiple chunks converge to the final
// (largest) values under the merge — simulating Gemini's real behavior
// of resending the running total in every chunk.
{
  const chunks = [
    { usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 3 } },
    { usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 9 } },
    { usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 18 } },
  ];
  let usage = null;
  for (const c of chunks) {
    const u = geminiExtractUsage(c);
    if (u) usage = mergeUsage(usage, u);
  }
  check('merged Gemini cumulative chunks converge to the final chunk\'s values',
    deepEqual(usage, { input_tokens: 30, output_tokens: 18 }));
}

// 7. A chunk without usageMetadata (a plain text-delta chunk) returns null.
{
  const evt = { candidates: [{ content: { parts: [{ text: 'hi' }] } }] };
  check('gemini chunk without usageMetadata returns null', geminiExtractUsage(evt) === null);
}

// ── Cross-provider shape consistency ────────────────────────────────────

// 8. All three shapes normalize to the same {input_tokens, output_tokens}
// key names — this is the whole point of Phase A2's normalization: the
// ledger bridge in handleApiChat needs no provider-specific branching.
{
  const openaiEvt     = { usage: { prompt_tokens: 10, completion_tokens: 5 } };
  const anthropicEvt  = { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 5 } } };
  const geminiEvt     = { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } };
  const openaiU    = openaiShapeExtractUsage(openaiEvt);
  const anthropicU = anthropicExtractUsage(anthropicEvt);
  const geminiU    = geminiExtractUsage(geminiEvt);
  check('OpenAI-shape, Anthropic, and Gemini all produce the same key names for equal token counts',
    deepEqual(openaiU, anthropicU) && deepEqual(anthropicU, geminiU));
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('All provider-usage-shape tests passed.');

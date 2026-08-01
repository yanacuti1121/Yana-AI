'use strict';
// Tests for worker.js's scrubGroqStream (Phase B3 — output-scrubber.js
// wired into the Cloudflare Worker's Groq SSE passthrough).
// Run: node _test_worker_scrub.js
//
// worker.js is genuine ESM (top-level `import`/`export`) — that's what
// wrangler/esbuild actually parses at deploy time, verified separately via
// `wrangler deploy --dry-run`. This repo's package.json has no
// "type": "module" (root-level .js files are CommonJS by default, and
// changing that would reclassify every other repo-root script — out of
// scope here), so `require('../../worker.js')` would throw a SyntaxError
// on the `import` statement. Instead this loads the REAL, unmodified file
// content as a data: URL, which Node's ESM loader always parses as a
// module regardless of package.json "type" — no copy, no drift risk, no
// wider package.json change.
const fs = require('fs');
const path = require('path');

const WORKER_PATH = path.join(__dirname, '..', '..', 'worker.js');
const SCRUBBER_PATH = path.join(__dirname, 'lib', 'output-scrubber.js');

async function loadWorker() {
  const src = fs.readFileSync(WORKER_PATH, 'utf8');
  const rewritten = src.replace(
    "from './tools/yana-web/lib/output-scrubber.js';",
    `from 'file://${SCRUBBER_PATH}';`
  );
  if (rewritten === src) {
    throw new Error('worker.js import line not found — rewrite pattern is stale, update this test');
  }
  const url = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(rewritten);
  return import(url);
}

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.error('FAIL:', name); }
}

// Minimal Web Streams ReadableStream built from an array of string chunks
// (mirrors how `upstream.body` looks after Groq's fetch response).
function streamFromChunks(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function drain(stream) {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += value;
  }
  return out;
}

function sseFrame(content, extra) {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-test',
    model: 'llama-3.3-70b-versatile',
    choices: [{ delta: { content }, index: 0, finish_reason: null }],
    ...extra,
  })}\n\n`;
}

async function main() {
  const { scrubGroqStream, withContent, BLOCKED_MESSAGE } = await loadWorker();

  // 1. Clean passthrough — normal content frames survive unchanged in shape,
  //    content unchanged.
  {
    const chunks = [sseFrame('Hello '), sseFrame('world!'), 'data: [DONE]\n\n'];
    const out = await drain(scrubGroqStream(streamFromChunks(chunks)));
    check('clean passthrough contains both words', out.includes('Hello') && out.includes('world!'));
    check('clean passthrough terminates with [DONE]', out.trim().endsWith('data: [DONE]'));
    check('clean passthrough preserves id/model fields', out.includes('chatcmpl-test') && out.includes('llama-3.3-70b-versatile'));
  }

  // 2. Role/finish_reason-only frame (no .delta.content) passes through untouched.
  {
    const roleFrame = `data: ${JSON.stringify({ id: 'x', choices: [{ delta: { role: 'assistant' }, index: 0, finish_reason: null }] })}\n\n`;
    const chunks = [roleFrame, sseFrame('hi'), 'data: [DONE]\n\n'];
    const out = await drain(scrubGroqStream(streamFromChunks(chunks)));
    check('role-only frame passed through verbatim', out.includes('"role":"assistant"'));
  }

  // 3. Secret pattern split across TWO separate stream chunks must still be
  //    caught (this is the entire reason output-scrubber.js uses a
  //    hold-back window instead of per-chunk regex matching).
  {
    // A GitHub PAT is 'github_pat_' + 82 chars — split the token itself
    // across two feed() calls via two separate SSE data: frames.
    const fullToken = 'github_pat_' + '1'.repeat(82);
    const half = Math.floor(fullToken.length / 2);
    const chunks = [
      sseFrame('here is a token: ' + fullToken.slice(0, half)),
      sseFrame(fullToken.slice(half) + ' — end'),
      'data: [DONE]\n\n',
    ];
    const out = await drain(scrubGroqStream(streamFromChunks(chunks)));
    check('split secret across chunks is blocked, not leaked', !out.includes(fullToken) && out.includes(BLOCKED_MESSAGE));
  }

  // 4. Hard-block mid-stream stops forwarding further upstream frames.
  {
    const fullToken = 'github_pat_' + '2'.repeat(82);
    const chunks = [
      sseFrame('leaking: ' + fullToken),
      sseFrame('this should never reach the client'),
      'data: [DONE]\n\n',
    ];
    const out = await drain(scrubGroqStream(streamFromChunks(chunks)));
    check('content after a hard block is not forwarded', !out.includes('never reach the client'));
    check('stream still closes with [DONE] after a block', out.trim().endsWith('data: [DONE]'));
  }

  // 5. withContent preserves every field except delta.content.
  {
    const evt = { id: 'abc', model: 'm', choices: [{ delta: { content: 'orig' }, index: 0, finish_reason: 'stop' }] };
    const frame = withContent(evt, 'replaced');
    const parsed = JSON.parse(frame.replace(/^data: /, '').trim());
    check('withContent replaces only delta.content', parsed.choices[0].delta.content === 'replaced');
    check('withContent preserves finish_reason', parsed.choices[0].finish_reason === 'stop');
    check('withContent preserves id/model', parsed.id === 'abc' && parsed.model === 'm');
  }

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('All worker.js scrubGroqStream tests passed.');
}

main().catch((e) => {
  console.error('FAIL: unexpected error', e);
  process.exit(1);
});

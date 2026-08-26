'use strict';

const path  = require('path');
const os    = require('os');
const fs    = require('fs');
const http  = require('http');
const https = require('https');

// Extracted from server.js so both the chat HTTP API and the robot
// WebSocket bridge (robot.js) can call the same provider table and
// connection helper in-process, without an HTTP round-trip to self.

// ── 9router local key (read once at startup) ─────────────────────────────────
// 9router runs on 127.0.0.1:20128 and requires Bearer auth for chat completions.
// Extract the first sk- API key from its SQLite database automatically so the
// user never has to paste a local token into Settings.
const NINE_ROUTER_KEY = (() => {
  try {
    const dbPath = path.join(os.homedir(), '.9router', 'db', 'data.sqlite');
    const buf = fs.readFileSync(dbPath);
    const m = buf.toString('binary').match(/sk-[a-f0-9]{16}-[a-z0-9]{4,8}-[a-f0-9]{8}/);
    return m ? m[0] : '';
  } catch (_) {
    return '';
  }
})();

// ── Provider table ────────────────────────────────────────────────────────────
// images = [{ mimeType: 'image/jpeg', data: '<base64>' }]
const PROVIDERS = {
  anthropic: {
    hostname:     'api.anthropic.com',
    path:         '/v1/messages',
    vision:       true,
    defaultModel: 'claude-sonnet-4-6',
    headers: key => ({
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    }),
    body: (model, system, task, images) => {
      const content = (images && images.length)
        ? [
            ...images.map(img => ({
              type: 'image',
              source: { type: 'base64', media_type: img.mimeType, data: img.data },
            })),
            { type: 'text', text: task },
          ]
        : task;
      return JSON.stringify({
        model, max_tokens: 2048, system, stream: true,
        messages: [{ role: 'user', content }],
      });
    },
    extractText: evt => evt?.delta?.text || null,
    // Anthropic splits usage across two SSE event types (both always
    // present by default — no stream_options-equivalent request flag
    // needed, unlike OpenAI-shape providers):
    //   message_start:  event.message.usage = {input_tokens, output_tokens}
    //                    (output_tokens here is a small placeholder, not final)
    //   message_delta:  event.usage = {output_tokens} (the real final count;
    //                    this event carries no input_tokens field at all)
    // pipeNormalizedSSE/emitLines merge (not overwrite) successive usage
    // objects specifically so this two-event split reassembles correctly:
    // message_start's input_tokens survives, message_delta's output_tokens
    // overwrites the placeholder.
    extractUsage: evt => {
      if (evt?.type === 'message_start' && evt.message?.usage) {
        const u = evt.message.usage;
        return { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0 };
      }
      if (evt?.type === 'message_delta' && evt.usage) {
        return { output_tokens: evt.usage.output_tokens || 0 };
      }
      return null;
    },
  },

  groq: {
    hostname:     'api.groq.com',
    path:         '/openai/v1/chat/completions',
    vision:       true,
    defaultModel: 'llama-3.3-70b-versatile',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task, images) => {
      const userContent = (images && images.length)
        ? [
            ...images.map(img => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
            { type: 'text', text: task },
          ]
        : task;
      return JSON.stringify({
        model, max_tokens: 2048, stream: true, stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: userContent },
        ],
      });
    },
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
    // Normalized to {input_tokens, output_tokens} — same output shape as
    // every other provider's extractUsage, so handleApiChat's ledger
    // bridge needs no provider-specific field-name branching.
    extractUsage: evt => evt?.usage
      ? { input_tokens: evt.usage.prompt_tokens || 0, output_tokens: evt.usage.completion_tokens || 0 }
      : null,
  },

  openai: {
    hostname:     'api.openai.com',
    path:         '/v1/chat/completions',
    vision:       true,
    defaultModel: 'gpt-4o-mini',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task, images) => {
      const userContent = (images && images.length)
        ? [
            ...images.map(img => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
            { type: 'text', text: task },
          ]
        : task;
      return JSON.stringify({
        model, max_tokens: 2048, stream: true, stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: userContent },
        ],
      });
    },
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
    // Normalized to {input_tokens, output_tokens} — same output shape as
    // every other provider's extractUsage, so handleApiChat's ledger
    // bridge needs no provider-specific field-name branching.
    extractUsage: evt => evt?.usage
      ? { input_tokens: evt.usage.prompt_tokens || 0, output_tokens: evt.usage.completion_tokens || 0 }
      : null,
  },

  // 9Router — local AI gateway (github.com/decolua/9router): one OpenAI-style
  // endpoint that fans out to 40+ providers with automatic fallback when a
  // quota runs out. Hardcoded loopback by design — never a remote host.
  '9router': {
    protocol:     'http',
    hostname:     '127.0.0.1',
    port:         20128,
    path:         '/v1/chat/completions',
    vision:       false,
    keyless:      true,
    local:        true,
    defaultModel: 'kr/claude-sonnet-4.5',
    headers: key => ({
      'Authorization': 'Bearer ' + (key || NINE_ROUTER_KEY),
      'content-type':  'application/json',
    }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, stream: true, stream_options: { include_usage: true },
      messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    }),
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
    // Normalized to {input_tokens, output_tokens} — same output shape as
    // every other provider's extractUsage, so handleApiChat's ledger
    // bridge needs no provider-specific field-name branching.
    extractUsage: evt => evt?.usage
      ? { input_tokens: evt.usage.prompt_tokens || 0, output_tokens: evt.usage.completion_tokens || 0 }
      : null,
  },

  // Ollama — on-device models (rule 68 SOVEREIGN tier: text that may never
  // reach a cloud AI). Keyless by design; loopback only, like 9router.
  ollama: {
    protocol:     'http',
    hostname:     '127.0.0.1',
    port:         11434,
    path:         '/v1/chat/completions',
    vision:       false,
    keyless:      true,
    local:        true,
    defaultModel: 'llama3.2',
    headers: _key => ({ 'content-type': 'application/json' }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, stream: true, stream_options: { include_usage: true },
      messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    }),
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
    // Normalized to {input_tokens, output_tokens} — same output shape as
    // every other provider's extractUsage, so handleApiChat's ledger
    // bridge needs no provider-specific field-name branching.
    extractUsage: evt => evt?.usage
      ? { input_tokens: evt.usage.prompt_tokens || 0, output_tokens: evt.usage.completion_tokens || 0 }
      : null,
  },

  // LM Studio — on-device models, same shape as ollama (OpenAI-compatible
  // local server, keyless, loopback), just a different default port/model.
  lmstudio: {
    protocol:     'http',
    hostname:     '127.0.0.1',
    port:         1234,
    path:         '/v1/chat/completions',
    vision:       false,
    keyless:      true,
    local:        true,
    defaultModel: 'local-model',
    headers: _key => ({ 'content-type': 'application/json' }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, stream: true, stream_options: { include_usage: true },
      messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    }),
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
    // Normalized to {input_tokens, output_tokens} — same output shape as
    // every other provider's extractUsage, so handleApiChat's ledger
    // bridge needs no provider-specific field-name branching.
    extractUsage: evt => evt?.usage
      ? { input_tokens: evt.usage.prompt_tokens || 0, output_tokens: evt.usage.completion_tokens || 0 }
      : null,
  },

  // TurboFieldfare — on-device Gemma 4 26B-A4B, same shape as ollama/lmstudio
  // (OpenAI-compatible local server, keyless, loopback). Confirmed against
  // Sources/TurboFieldfareServer/Core/OpenAIModels.swift +HTTPServer.swift:
  // it decodes stream/stream_options.include_usage and emits standard
  // choices[].delta.content chunks + usage.{prompt,completion}_tokens —
  // identical wire shape to ollama/lmstudio, no provider-specific branching
  // needed here.
  turbofieldfare: {
    protocol:     'http',
    hostname:     '127.0.0.1',
    port:         8091,
    path:         '/v1/chat/completions',
    vision:       false,
    keyless:      true,
    local:        true,
    defaultModel: 'gemma-4-26b-a4b-it',
    headers: _key => ({ 'content-type': 'application/json' }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, stream: true, stream_options: { include_usage: true },
      messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    }),
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
    extractUsage: evt => evt?.usage
      ? { input_tokens: evt.usage.prompt_tokens || 0, output_tokens: evt.usage.completion_tokens || 0 }
      : null,
  },

  gemini: {
    hostname:     'generativelanguage.googleapis.com',
    vision:       true,
    defaultModel: 'gemini-2.0-flash',
    // Key goes in the x-goog-api-key header, never the URL — query strings
    // leak into access logs and proxies (API2: broken authentication).
    buildPath: (model, _key) =>
      `/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    headers: key => ({ 'content-type': 'application/json', 'x-goog-api-key': key }),
    body: (model, system, task, images) => {
      const parts = [
        ...(images || []).map(img => ({
          inlineData: { mimeType: img.mimeType, data: img.data },
        })),
        { text: task },
      ];
      return JSON.stringify({
        contents: [{ role: 'user', parts }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { maxOutputTokens: 2048 },
      });
    },
    extractText: evt => evt?.candidates?.[0]?.content?.parts?.[0]?.text || null,
    // Gemini includes usageMetadata by default in every streamed chunk
    // (no request-side opt-in needed), as cumulative running totals —
    // the last chunk's numbers are the true final ones. The merge in
    // pipeNormalizedSSE/emitLines makes repeatedly "overwriting" with each
    // successive cumulative snapshot converge to that final value.
    extractUsage: evt => evt?.usageMetadata
      ? { input_tokens: evt.usageMetadata.promptTokenCount || 0, output_tokens: evt.usageMetadata.candidatesTokenCount || 0 }
      : null,
  },

  deepseek: {
    hostname:     'api.deepseek.com',
    path:         '/v1/chat/completions',
    vision:       false,
    defaultModel: 'deepseek-chat',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, stream: true, stream_options: { include_usage: true },
      messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    }),
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
    // Normalized to {input_tokens, output_tokens} — same output shape as
    // every other provider's extractUsage, so handleApiChat's ledger
    // bridge needs no provider-specific field-name branching.
    extractUsage: evt => evt?.usage
      ? { input_tokens: evt.usage.prompt_tokens || 0, output_tokens: evt.usage.completion_tokens || 0 }
      : null,
  },

  openrouter: {
    hostname:     'openrouter.ai',
    path:         '/api/v1/chat/completions',
    vision:       true,
    defaultModel: 'google/gemma-3-27b-it',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
      'HTTP-Referer':  'https://github.com/yanacuti1121/yana-ai',
      'X-Title':       'Yana AI',
    }),
    body: (model, system, task, images) => {
      const userContent = (images && images.length)
        ? [
            ...images.map(img => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
            { type: 'text', text: task },
          ]
        : task;
      return JSON.stringify({
        model, max_tokens: 2048, stream: true, stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: userContent },
        ],
      });
    },
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
    // Normalized to {input_tokens, output_tokens} — same output shape as
    // every other provider's extractUsage, so handleApiChat's ledger
    // bridge needs no provider-specific field-name branching.
    extractUsage: evt => evt?.usage
      ? { input_tokens: evt.usage.prompt_tokens || 0, output_tokens: evt.usage.completion_tokens || 0 }
      : null,
  },

  xai: {
    hostname:     'api.x.ai',
    path:         '/v1/chat/completions',
    vision:       true,
    defaultModel: 'grok-3-mini',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task, images) => {
      const userContent = (images && images.length)
        ? [
            ...images.map(img => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
            { type: 'text', text: task },
          ]
        : task;
      return JSON.stringify({
        model, max_tokens: 2048, stream: true, stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: userContent },
        ],
      });
    },
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
    // Normalized to {input_tokens, output_tokens} — same output shape as
    // every other provider's extractUsage, so handleApiChat's ledger
    // bridge needs no provider-specific field-name branching.
    extractUsage: evt => evt?.usage
      ? { input_tokens: evt.usage.prompt_tokens || 0, output_tokens: evt.usage.completion_tokens || 0 }
      : null,
  },

  novita: {
    hostname:     'api.novita.ai',
    path:         '/v3/openai/chat/completions',
    vision:       false,
    defaultModel: 'meta-llama/llama-3.1-70b-instruct',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, stream: true,
      messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    }),
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
  },

  nvidia: {
    hostname:     'integrate.api.nvidia.com',
    path:         '/v1/chat/completions',
    vision:       false,
    defaultModel: 'nvidia/llama-3.1-nemotron-70b-instruct',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, stream: true,
      messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    }),
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
  },

  kimi: {
    hostname:     'api.moonshot.cn',
    path:         '/v1/chat/completions',
    vision:       false,
    defaultModel: 'moonshot-v1-8k',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, stream: true,
      messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    }),
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
  },

  minimax: {
    hostname:     'api.minimax.chat',
    path:         '/v1/chat/completions',
    vision:       false,
    defaultModel: 'abab6.5s-chat',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, stream: true,
      messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    }),
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
  },

  glm: {
    hostname:     'open.bigmodel.cn',
    path:         '/api/paas/v4/chat/completions',
    vision:       true,
    defaultModel: 'glm-4-flash',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task, images) => {
      const userContent = (images && images.length)
        ? [
            ...images.map(img => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
            { type: 'text', text: task },
          ]
        : task;
      return JSON.stringify({
        model, max_tokens: 2048, stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: userContent },
        ],
      });
    },
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
  },

  huggingface: {
    hostname:     'router.huggingface.co',
    path:         '/v1/chat/completions',
    vision:       false,
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    headers: key => ({
      'Authorization': `Bearer ${key}`,
      'content-type':  'application/json',
    }),
    body: (model, system, task) => JSON.stringify({
      model, max_tokens: 2048, stream: true,
      messages: [{ role: 'system', content: system }, { role: 'user', content: task }],
    }),
    extractText: evt => evt?.choices?.[0]?.delta?.content || null,
  },
};

// Extracted from the single connection attempt that used to live inline
// in handleApiChat — same behavior for a single call (resolves on 2xx,
// rejects with a descriptive Error on transport failure or non-2xx),
// now reusable per fallback-chain candidate.
function connectToProvider(providerEntry, apiKey, reqBody, reqPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: providerEntry.hostname,
      port:     providerEntry.port,
      path:     reqPath,
      method:   'POST',
      headers:  { ...providerEntry.headers(apiKey), 'content-length': Buffer.byteLength(reqBody) },
    };
    // http only for loopback providers (9router) — every remote host stays TLS
    const transport = (providerEntry.protocol === 'http' && providerEntry.hostname === '127.0.0.1') ? http : https;

    const upstreamReq = transport.request(options, upstreamRes => {
      if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
        let errBody = '';
        upstreamRes.on('data', c => { errBody += c; });
        upstreamRes.on('end', () => {
          let detail = '';
          try { const j = JSON.parse(errBody); detail = j.error?.message || j.message || ''; } catch (_) {}
          reject(new Error(`Upstream HTTP ${upstreamRes.statusCode}${detail ? ': ' + detail : ''}`));
        });
        return;
      }
      resolve(upstreamRes);
    });

    upstreamReq.on('error', err => reject(err));
    upstreamReq.write(reqBody);
    upstreamReq.end();
  });
}

function getNineRouterKey() {
  return NINE_ROUTER_KEY;
}

module.exports = { PROVIDERS, connectToProvider, getNineRouterKey };

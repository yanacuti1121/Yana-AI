// Yana AI IO — Cloudflare Worker chat proxy to Groq.
//
// SECURITY (2026-07-12, findings from
// docs/Yana-AI-Danh-gia-Kien-truc-Bao-mat.md sections 1.1-1.3, independently
// re-verified against this file before fixing — the Groq key was never
// exposed to the client, but the endpoint itself was a public open proxy):
// no auth, no rate limit, CORS wildcard, and client-supplied messages were
// spread into the Groq payload unfiltered — a caller could inject its own
// role:"system" message, and there was no cap on message count or length.
// Fixed below: origin allowlist, per-IP rate limit (KV-backed, degrades to
// no-limit rather than failing the endpoint if the binding isn't
// provisioned yet — see checkRateLimit's comment), role filtering with a
// message/length cap, and a generic error response instead of forwarding
// Groq's raw error body to the client.

const ALLOWED_ORIGINS = [
  'https://yana-ai.pages.dev', // confirmed canonical origin (docs/index.html's <link rel="canonical">)
  'https://yanacuti1121.github.io',
];

const MAX_MESSAGES = 20;
const MAX_TOTAL_CHARS = 8000;
const RATE_LIMIT_PER_MINUTE = 20; // matches core/config/rate-limits.json's api_calls_per_minute convention
const RATE_LIMIT_WINDOW_SECONDS = 60;

const SYSTEM = `You are Yana AI IO — an AI assistant for the Yana AI project.
Yana AI is an agent operating system for Claude Code with 1,989 skills, 101 agents, 50 safety hooks, and a Rust runtime (yana-rt).

LANGUAGE RULE: Detect the user's language and always reply in the SAME language.
- If user writes Vietnamese → reply in Vietnamese
- If user writes English → reply in English
- If user writes Korean (한국어) → reply in Korean (한국어)
Keep answers short (2-4 sentences). Be direct and helpful.`;

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function jsonError(message, status, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// Filters client-supplied messages down to a safe shape before they're
// concatenated with the real system prompt: only user/assistant roles pass
// through (a client-supplied role:"system" is dropped, not just ignored, so
// it can't smuggle a second system message into the array), and both
// message count and combined content length are capped.
function sanitizeMessages(bodyMessages) {
  if (!Array.isArray(bodyMessages)) return [];
  const safe = [];
  let totalChars = 0;
  for (const m of bodyMessages) {
    if (safe.length >= MAX_MESSAGES) break;
    if (!m || typeof m !== 'object') continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = typeof m.content === 'string' ? m.content : '';
    if (!content) continue;
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) break;
    safe.push({ role: m.role, content });
  }
  return safe;
}

// Per-IP rate limit backed by an optional KV binding (env.RATE_LIMIT_KV).
// Fails OPEN (no limiting, endpoint still works) if the binding isn't
// provisioned yet, rather than breaking the endpoint for everyone the
// moment this ships. Provision it with:
//   wrangler kv namespace create RATE_LIMIT_KV
// then add the returned id to wrangler.jsonc's "kv_namespaces". Until then,
// enabling Cloudflare's dashboard-level Rate Limiting Rules on this route
// is a zero-code alternative that covers the same threat.
async function checkRateLimit(env, ip) {
  if (!env.RATE_LIMIT_KV) return false;
  const key = `rl:${ip}`;
  const raw = await env.RATE_LIMIT_KV.get(key);
  const count = raw ? parseInt(raw, 10) || 0 : 0;
  if (count >= RATE_LIMIT_PER_MINUTE) return true;
  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === 'POST' && url.pathname === '/api/chat') {
      // Browsers send Origin on a cross-origin fetch, so a disallowed
      // origin is rejected outright here. Non-browser callers (curl,
      // server-to-server) don't send Origin at all, so this check alone
      // can't stop them — the rate limit below is what covers that case.
      if (origin && !ALLOWED_ORIGINS.includes(origin)) {
        return jsonError('origin_not_allowed', 403, origin);
      }

      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (await checkRateLimit(env, ip)) {
        return jsonError('rate_limited', 429, origin);
      }

      if (!env.GROQ_API_KEY) {
        return jsonError('service_unavailable', 500, origin);
      }

      let body;
      try { body = await request.json(); }
      catch { return jsonError('bad_request', 400, origin); }

      const { messages: bodyMessages, lang } = body;
      const langInstruction = lang === 'ko' ? 'Respond ONLY in Korean (한국어).'
        : lang === 'vi' ? 'Respond ONLY in Vietnamese (Tiếng Việt).'
        : 'Respond ONLY in English.';

      const messages = [
        { role: 'system', content: `${SYSTEM}\n\n${langInstruction}` },
        ...sanitizeMessages(bodyMessages),
      ];

      let upstream;
      try {
        upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 512,
            messages,
            stream: true,
          }),
        });
      } catch (e) {
        console.error('groq fetch failed', e);
        return jsonError('upstream_unavailable', 502, origin);
      }

      if (!upstream.ok) {
        // Log the real upstream error server-side (visible via `wrangler
        // tail` / Cloudflare Observability, already enabled in
        // wrangler.jsonc) — never forward it verbatim to the client, which
        // could leak model config, quota state, or request internals to an
        // attacker probing this endpoint.
        console.error('groq upstream error', upstream.status, await upstream.text());
        return jsonError('upstream_unavailable', upstream.status, origin);
      }

      return new Response(upstream.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...corsHeaders(origin),
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};

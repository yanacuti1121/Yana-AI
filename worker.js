const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SYSTEM = `Bạn là YAMTAM IO — trợ lý AI ngắn gọn cho dự án YAMTAM ENGINE.
YAMTAM ENGINE là một agent operating system cho Claude Code với 3.437 skills, 93 agents, 45 safety hooks, và Rust runtime (yamtam-rt).
Trả lời câu hỏi về coding, debugging, và YAMTAM. Giữ câu trả lời ngắn (2-4 câu). Trả lời cùng ngôn ngữ với người dùng.`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method === 'POST' && url.pathname === '/api/chat') {
      if (!env.ANTHROPIC_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured in Worker env' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
        );
      }

      let body;
      try { body = await request.json(); }
      catch { return new Response('Bad JSON', { status: 400, headers: CORS }); }

      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: SYSTEM,
          messages: body.messages ?? [],
          stream: true,
        }),
      });

      if (!upstream.ok) {
        const err = await upstream.text();
        return new Response(err, { status: upstream.status, headers: CORS });
      }

      return new Response(upstream.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...CORS,
        },
      });
    }

    // Static assets fallback
    return env.ASSETS.fetch(request);
  },
};

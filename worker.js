const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SYSTEM = `You are Yana AI IO — an AI assistant for the Yana AI project.
Yana AI is an agent operating system for Claude Code with 1,989 skills, 101 agents, 50 safety hooks, and a Rust runtime (yana-rt).

LANGUAGE RULE: Detect the user's language and always reply in the SAME language.
- If user writes Vietnamese → reply in Vietnamese
- If user writes English → reply in English
- If user writes Korean (한국어) → reply in Korean (한국어)
Keep answers short (2-4 sentences). Be direct and helpful.`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method === 'POST' && url.pathname === '/api/chat') {
      if (!env.GROQ_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'GROQ_API_KEY not configured in Worker env' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
        );
      }

      let body;
      try { body = await request.json(); }
      catch { return new Response('Bad JSON', { status: 400, headers: CORS }); }

      const { messages: bodyMessages, lang } = body;
      const langInstruction = lang === 'ko' ? 'Respond ONLY in Korean (한국어).'
        : lang === 'vi' ? 'Respond ONLY in Vietnamese (Tiếng Việt).'
        : 'Respond ONLY in English.';

      const messages = [
        { role: 'system', content: `${SYSTEM}\n\n${langInstruction}` },
        ...(bodyMessages ?? []),
      ];

      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

    return env.ASSETS.fetch(request);
  },
};

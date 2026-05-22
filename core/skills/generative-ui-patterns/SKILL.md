---
name: generative-ui-patterns
description: >
  Build streaming and generative UI with Vercel AI SDK — useChat, useCompletion,
  streamText, streamUI, tool calling in the UI layer, loading states for
  streaming, error boundaries, and AI-native component patterns. Use when
  asked about "Vercel AI SDK", "useChat", "AI SDK", "streaming chat UI",
  "streamText", "streamUI", "generative UI", "AI-generated components",
  "tool call UI", "LLM streaming response", "chat interface", "loading
  skeleton for AI", "partial response rendering", or "AI message streaming".
  Do NOT use for: LLM backend prompt engineering — see prompt-engineering.
  Do NOT use for: React Server Components — see nextjs-patterns.
origin: adapted:MIT © Vercel/ai (AI SDK)
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Vercel AI SDK v4 (@ai-sdk/react, ai). Next.js 14+ App Router. React ≥ 18."
---

## When to Use

- Use when: building a chat interface that streams LLM responses
- Use when: an AI response should render structured React components, not just text
- Use when: tool calls need visual feedback as they execute
- Do NOT use for: non-streaming AI calls (use `generateText` for one-shot)
- Do NOT use for: non-React environments — AI SDK React hooks are React-specific

---

## useChat — Chat Interface

```tsx
// app/chat/page.tsx
'use client';
import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error, stop } = useChat({
    api: '/api/chat',
    onError: (err) => console.error('Chat error:', err),
  });

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`rounded-2xl px-4 py-2 max-w-[80%] ${
              m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              {m.content}
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl px-4 py-2">
              <span className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Type a message..."
          className="flex-1 rounded-full border px-4 py-2"
          disabled={isLoading}
        />
        {isLoading
          ? <button type="button" onClick={stop}>Stop</button>
          : <button type="submit">Send</button>
        }
      </form>

      {error && <div className="text-destructive p-2">{error.message}</div>}
    </div>
  );
}
```

---

## Route Handler — streamText

```ts
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { streamText, tool } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: 'You are a helpful assistant.',
    messages,
    tools: {
      getWeather: tool({
        description: 'Get current weather for a city',
        parameters: z.object({
          city: z.string().describe('City name'),
        }),
        execute: async ({ city }) => {
          const weather = await fetchWeather(city);   // real API call
          return weather;
        },
      }),
    },
    maxSteps: 5,   // allow tool calls + follow-up responses
    onFinish({ usage, finishReason }) {
      console.log({ usage, finishReason });   // log token usage
    },
  });

  return result.toDataStreamResponse();
}
```

---

## Tool Call UI — Show Progress

```tsx
// Render tool calls as they happen
{messages.map(m => (
  <div key={m.id}>
    {m.role === 'assistant' && m.parts?.map((part, i) => {
      if (part.type === 'text') {
        return <p key={i}>{part.text}</p>;
      }
      if (part.type === 'tool-invocation') {
        return (
          <div key={i} className="rounded-lg border p-3 my-2 text-sm">
            {part.toolInvocation.state === 'call' && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Spinner className="w-4 h-4" />
                Calling {part.toolInvocation.toolName}...
              </div>
            )}
            {part.toolInvocation.state === 'result' && (
              <div>
                <span className="text-green-500">✓</span> {part.toolInvocation.toolName}
                <pre className="mt-1 text-xs opacity-70">
                  {JSON.stringify(part.toolInvocation.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      }
    })}
  </div>
))}
```

---

## Generative UI — Render Components from AI

```tsx
// Return React components as part of the stream (RSC-based)
// app/api/chat/route.ts — using createStreamableUI
import { createStreamableUI, createStreamableValue } from 'ai/rsc';

export async function submitMessage(input: string) {
  'use server';

  const uiStream = createStreamableUI(<Spinner />);

  (async () => {
    const result = await generateText({ model: anthropic('claude-sonnet-4-6'), prompt: input });

    if (result.text.includes('weather')) {
      uiStream.update(<WeatherCard data={await getWeather()} />);
    } else {
      uiStream.update(<p>{result.text}</p>);
    }
    uiStream.done();
  })();

  return { ui: uiStream.value };
}
```

---

## Performance Budget for AI UI

```
Streaming first token:  < 500ms  (use fastest model for interactive chat)
Full response display:  progressive — user sees text immediately, no blank wait
Tool call indicator:    visible within 50ms of tool invocation
Error state:            shown within 200ms of API error
Input disabled:         while streaming (prevent double-submit)
Stop button:            always visible while isLoading = true
```

---

## Anti-Fake-Pass Rules

Before claiming AI chat UI is production-ready, you MUST show:
- [ ] `isLoading` drives both spinner and disabled input — no "submit while streaming"
- [ ] `stop()` button available during streaming — user can cancel long responses
- [ ] Errors surfaced in UI — not just `console.error`
- [ ] Tool calls show progress state (`call` → `result`) — not silent black box
- [ ] `maxDuration` set on route handler — no indefinitely hanging requests
- [ ] `usage` logged server-side — token costs are observable

Reference: `gates/anti-fake-pass-gate.md`

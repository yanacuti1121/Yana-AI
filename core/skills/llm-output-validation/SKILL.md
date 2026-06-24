---
name: llm-output-validation
description: LLM output validation patterns — structured output schemas, hallucination detection, retry-with-backoff, streaming output safety, tool-call validation, and confidence scoring. Sources: instructor-ai/instructor, colinhacks/zod, vercel/ai, anthropics/anthropic-sdk-python, outlines-dev/outlines, guardrails-ai/guardrails.
origin: yana-ai — synthesized from instructor-ai/instructor, colinhacks/zod, vercel/ai, anthropics/anthropic-sdk-python, outlines-dev/outlines, guardrails-ai/guardrails
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.39
---

# /llm-output-validation

## When to Use

- LLM must return structured data (JSON, typed objects)
- Detecting hallucinated facts before they reach users
- Streaming responses that must stay within safety bounds
- Tool-calling agents where malformed tool args break downstream code

## Do NOT use for

- Pure chat with no downstream data consumption
- Internal dev-only tools where hallucination cost is low

---

## Structured Output with Zod (Vercel AI SDK)

```typescript
import { generateObject } from 'ai'
import { z } from 'zod'

const schema = z.object({
  title:      z.string().max(80),
  tags:       z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
  sources:    z.array(z.string().url()).optional(),
})

const { object } = await generateObject({
  model,
  schema,
  prompt: 'Summarize this article...',
})
// → TypeScript type inferred from schema — no casting
// → Retries automatically on parse failure (default: 3)
```

---

## Instructor Pattern (Python — typed extraction)

```python
import instructor
from pydantic import BaseModel, Field
from anthropic import Anthropic

client = instructor.from_anthropic(Anthropic())

class ExtractedEntity(BaseModel):
    name:       str
    entity_type: str = Field(description="person, org, location, or product")
    confidence: float = Field(ge=0.0, le=1.0)

entities = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=1024,
    response_model=list[ExtractedEntity],
    messages=[{"role": "user", "content": text}],
)
# → Pydantic validates and retries on schema violation
# → max_retries=3 by default
```

---

## Hallucination Detection (self-consistency check)

```typescript
async function withConsistencyCheck(prompt: string, runs = 3) {
  const answers = await Promise.all(
    Array.from({ length: runs }, () =>
      generateText({ model, prompt, temperature: 0.5 })
    )
  )

  // Check if key facts are consistent across runs
  const facts = answers.map(a => extractKeyFacts(a.text))
  const consistent = facts.every(f =>
    JSON.stringify(f) === JSON.stringify(facts[0])
  )

  if (!consistent) {
    return { answer: answers[0].text, confidence: 'LOW', warning: 'Inconsistent across runs' }
  }
  return { answer: answers[0].text, confidence: 'HIGH' }
}

// Rule: run 3 samples for any factual claim going to production
// Rule: temperature > 0 required for self-consistency (0 = same answer always)
```

---

## Retry with Exponential Backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, baseDelayMs = 500 } = {}
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxAttempts) throw err
      const delay = baseDelayMs * 2 ** (attempt - 1)  // 500, 1000, 2000ms
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}

// Usage: parsing failure, rate limit 429, or schema validation error
const result = await withRetry(() =>
  generateObject({ model, schema, prompt })
)
```

---

## Streaming Output Safety

```typescript
import { streamText } from 'ai'

const stream = streamText({ model, prompt })

// Validate as chunks arrive — abort if safety threshold crossed
let buffer = ''
for await (const chunk of stream.textStream) {
  buffer += chunk

  // Block PII patterns mid-stream
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(buffer)) {  // SSN pattern
    stream.consumeStream()   // drain and discard
    throw new Error('PII detected in stream — aborted')
  }

  yield chunk  // only yield if safe
}
```

---

## Tool-Call Argument Validation

```typescript
// Never trust tool arguments from LLM without Zod parse
const DeleteArgs = z.object({
  resourceId: z.string().uuid(),  // must be valid UUID
  confirm:    z.literal(true),    // explicit confirmation required
})

async function handleDeleteTool(rawArgs: unknown) {
  const args = DeleteArgs.safeParse(rawArgs)
  if (!args.success) {
    return { error: `Invalid args: ${args.error.message}` }
    // Return error to model — let it retry with corrected args
  }
  return await deleteResource(args.data.resourceId)
}
```

---

## Anti-Fake-Pass Checklist

```
❌ LLM JSON response parsed with JSON.parse() without schema validation
❌ Self-consistency check run with temperature: 0 (always same answer)
❌ Retry loop with no exponential backoff (hammers rate limit)
❌ Tool arguments passed directly to business logic without Zod parse
❌ Streaming response yielded to user without PII scan
❌ Confidence declared HIGH on single-run output with no consistency check
❌ generateObject without max token limit (unbounded response = parse fail)
```

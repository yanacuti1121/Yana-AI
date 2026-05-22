---
name: type-safe-api-contracts
description: Type-safe API contract patterns. tRPC end-to-end typed procedures, ts-rest shared contract definitions, zod-to-openapi spec generation, Zodios Axios client, and contract-first development workflow. Sources: trpc/trpc, ts-rest/ts-rest, asteasolutions/zod-to-openapi, zodios/zodios, ecyrbe/zodios.
origin: yamtam-engine — synthesized from trpc/trpc, ts-rest/ts-rest, asteasolutions/zod-to-openapi, zodios/zodios, ecyrbe/zodios
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.44
---

# /type-safe-api-contracts

## When to Use

- TypeScript monorepo where frontend + backend share the same contract
- "The API changed and the frontend silently broke" — need compile-time safety
- Generating OpenAPI spec from Zod schemas (single source of truth)
- External clients need an OpenAPI doc but you don't want to maintain it manually

## Do NOT use for

- Pure REST API consumed by non-TypeScript clients only (use OpenAPI spec directly)
- GraphQL systems (use code-first GraphQL instead)

---

## Decision: tRPC vs ts-rest vs Zodios

```
Same TypeScript monorepo, full type inference end-to-end?
  YES → tRPC (no schema, types inferred from router definition)
  NO  →
    Need REST endpoints compatible with non-TS clients?
      YES → ts-rest (typed contract, real HTTP verbs, OpenAPI export)
      Need Axios with typed responses from existing OpenAPI?
        YES → Zodios (Axios + Zod runtime validation from OpenAPI)
```

---

## tRPC (end-to-end type inference)

```typescript
// server/router.ts
import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'

const t = initTRPC.context<{ userId: string }>().create()
export const router  = t.router
export const publicProcedure    = t.procedure
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx })
})

export const appRouter = router({
  agent: router({
    run: protectedProcedure
      .input(z.object({ task: z.string().min(1), depth: z.number().int().max(5).default(1) }))
      .output(z.object({ result: z.string(), tokensUsed: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await runAgent(input.task, ctx.userId, input.depth)
        return result
      }),

    history: protectedProcedure
      .input(z.object({ limit: z.number().default(20) }))
      .query(async ({ input, ctx }) => getHistory(ctx.userId, input.limit)),
  }),
})

export type AppRouter = typeof appRouter
```

```typescript
// client/trpc.ts — full type inference, no codegen
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '../server/router'

const trpc = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc', headers: () => ({ Authorization: `Bearer ${token}` }) })],
})

// Fully typed — IDE autocomplete on every call
const { result, tokensUsed } = await trpc.agent.run.mutate({ task: 'summarize repo' })

// Rule: always define .output() schema — prevents leaking server-internal fields
// Rule: use httpBatchLink for SPA (batches multiple calls into one HTTP request)
// Rule: TRPCError code maps to HTTP status — UNAUTHORIZED=401, NOT_FOUND=404, etc.
```

---

## ts-rest (typed REST contracts)

```typescript
// contracts/agent.ts — shared between server and client
import { initContract } from '@ts-rest/core'
import { z } from 'zod'

const c = initContract()

export const agentContract = c.router({
  run: {
    method:   'POST',
    path:     '/agents/run',
    body:     z.object({ task: z.string(), sessionId: z.string().uuid() }),
    responses: {
      200: z.object({ result: z.string(), elapsedMs: z.number() }),
      429: z.object({ retryAfter: z.number() }),
    },
    summary: 'Run an agent task',
  },
  getResult: {
    method:   'GET',
    path:     '/agents/:id/result',
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: z.object({ status: z.enum(['pending', 'done', 'failed']), result: z.string().optional() }),
      404: z.object({ message: z.string() }),
    },
  },
})
```

```typescript
// server/routes.ts — Next.js / Express handler
import { createNextRouter } from '@ts-rest/next'
import { agentContract }    from '../contracts/agent'

export default createNextRouter(agentContract, {
  run: async ({ body }) => {
    const result = await executeAgentTask(body.task, body.sessionId)
    return { status: 200, body: result }
  },
  getResult: async ({ params }) => {
    const task = await getTask(params.id)
    if (!task) return { status: 404, body: { message: 'Not found' } }
    return { status: 200, body: task }
  },
})
```

```typescript
// client/api.ts — types inferred from same contract
import { initQueryClient } from '@ts-rest/react-query'
import { agentContract }   from '../contracts/agent'

const client = initQueryClient(agentContract, { baseUrl: '/api' })

// Typed response — status 200 body is always z.infer<typeof responses[200]>
const { data } = client.getResult.useQuery(['agent', id], { params: { id } })
```

---

## zod-to-openapi (spec generation)

```typescript
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

const registry = new OpenAPIRegistry()

// Register schemas
const AgentRunBody = registry.register('AgentRunBody',
  z.object({
    task:      z.string().min(1).openapi({ example: 'summarize the PR' }),
    sessionId: z.string().uuid(),
  })
)

const AgentRunResult = registry.register('AgentRunResult',
  z.object({
    result:    z.string(),
    elapsedMs: z.number().int(),
  })
)

// Register path
registry.registerPath({
  method:  'post',
  path:    '/agents/run',
  summary: 'Execute an agent task',
  request: { body: { content: { 'application/json': { schema: AgentRunBody } } } },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: AgentRunResult } } },
    429: { description: 'Rate limited' },
  },
})

// Generate spec
const generator = new OpenApiGeneratorV3(registry.definitions)
const spec      = generator.generateDocument({
  openapi: '3.0.0',
  info:    { title: 'YAMTAM Agent API', version: '1.3.44' },
  servers: [{ url: '/api' }],
})

// Rule: write spec to releases/openapi.json in CI — never hand-edit
// Rule: Zod schemas ARE the source of truth; spec is a derived artifact
```

---

## Zodios (Axios + Zod typed client)

```typescript
import { makeApi, Zodios } from '@zodios/core'
import { z } from 'zod'

const api = makeApi([
  {
    method:   'post',
    path:     '/agents/run',
    alias:    'runAgent',
    response: z.object({ result: z.string(), elapsedMs: z.number() }),
    parameters: [{
      name: 'body',
      type: 'Body',
      schema: z.object({ task: z.string(), sessionId: z.string().uuid() }),
    }],
    errors: [
      { status: 429, schema: z.object({ retryAfter: z.number() }) },
    ],
  },
])

const client = new Zodios('/api', api)

// Fully typed call — response is inferred from schema
const { result } = await client.runAgent({ task: 'list PRs', sessionId: crypto.randomUUID() })

// Rule: Zodios validates response at runtime — throws ZodError on mismatch
// Rule: use alias to get named method on client (not positional array indexing)
```

---

## Anti-Fake-Pass Checklist

```
❌ tRPC .output() missing (server-internal fields can leak to client)
❌ ts-rest path params not in pathParams schema (runtime crash on mismatch)
❌ OpenAPI spec hand-edited instead of generated from Zod (drift guaranteed)
❌ Zodios client used without error schema (429/500 untyped)
❌ tRPC httpBatchLink missing — each call = separate HTTP round-trip
❌ Contract defined in server package, not shared package (client can't import it)
❌ Zod .openapi() metadata omitted — spec examples missing, docs useless
```

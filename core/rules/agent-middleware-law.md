**Rule:** agent-middleware-law
**Status:** REVIEWED
**Gate:** L2 — every tool call, before execution and after result
**Source:** Express.js middleware pattern, OWASP LLM07 (plugin design), anthropic/model-spec (minimal footprint), statelyai/xstate (state machines for agent flow)

---

# Agent Middleware Law

## Principle

Every tool call from an agent MUST pass through a middleware pipeline
before execution and after result. No tool call reaches runtime directly.

```
Agent intent
    │
    ▼
┌─────────────────────────────────────┐
│  PRE-EXECUTION MIDDLEWARE STACK     │
│  1. injection-scan    (LLM01/LLM07) │
│  2. blast-radius      (LLM08)       │
│  3. permission-check  (Gate L2)     │
│  4. egress-check      (Gate L3)     │
│  5. schema-validate   (LLM07)       │
└──────────────┬──────────────────────┘
               │  all pass → execute
               ▼
         [Tool executes]
               │
               ▼
┌─────────────────────────────────────┐
│  POST-EXECUTION MIDDLEWARE STACK    │
│  6. output-sanitize   (LLM02)       │
│  7. pii-scrub         (LLM06)       │
│  8. size-cap          (LLM04)       │
│  9. audit-log         (L0)          │
└──────────────┬──────────────────────┘
               │
               ▼
         Agent receives result
```

## Middleware contract

```typescript
interface ToolMiddleware {
  name: string
  pre?:  (ctx: ToolContext) => Promise<ToolContext | MiddlewareReject>
  post?: (ctx: ToolContext) => Promise<ToolContext | MiddlewareReject>
}

interface ToolContext {
  tool:       string          // tool name
  args:       Record<string, unknown>
  result?:    string          // populated after execution
  agentId:    string
  sessionId:  string
  depth:      number          // sub-agent depth
  blastScore: number          // 0–5 blast radius
}

interface MiddlewareReject {
  blocked: true
  reason:  string
  gate:    string             // e.g. "L2", "L3"
  exitCode: number
}
```

## Built-in middleware stack

```typescript
const MIDDLEWARE_STACK: ToolMiddleware[] = [

  // 1. Injection scan — block poisoned tool params before execution
  {
    name: 'injection-scan',
    pre: async (ctx) => {
      const raw = JSON.stringify(ctx.args)
      const PATTERNS = [/ignore.{0,20}(previous|all)/i, /system:\s/i, /\[INST\]/]
      if (PATTERNS.some(p => p.test(raw))) {
        return { blocked: true, reason: 'injection in tool args', gate: 'L3', exitCode: 3 }
      }
      return ctx
    }
  },

  // 2. Blast radius — cap destructive scope
  {
    name: 'blast-radius',
    pre: async (ctx) => {
      ctx.blastScore = computeBlastRadius(ctx)
      if (ctx.blastScore >= 4 && !process.env.YAMTAM_IRREVERSIBLE_OK) {
        return { blocked: true, reason: `blast score ${ctx.blastScore}/5`, gate: 'L1', exitCode: 1 }
      }
      return ctx
    }
  },

  // 3. Permission check — verify agent tier for this tool
  {
    name: 'permission-check',
    pre: async (ctx) => {
      const tier = getAgentTier(ctx.agentId)
      if (TIER_X_TOOLS.includes(ctx.tool) && tier < 'X') {
        return { blocked: true, reason: `Tier ${tier} agent cannot use ${ctx.tool}`, gate: 'L2', exitCode: 2 }
      }
      return ctx
    }
  },

  // 4. Egress check — SSRF guard for HTTP tools
  {
    name: 'egress-check',
    pre: async (ctx) => {
      if (ctx.tool === 'WebFetch' || ctx.tool === 'http') {
        const url = ctx.args.url as string
        if (isSsrfTarget(url)) {
          return { blocked: true, reason: `SSRF blocked: ${url}`, gate: 'L3', exitCode: 3 }
        }
      }
      return ctx
    }
  },

  // 5. Output sanitize — wrap result before returning to agent
  {
    name: 'output-sanitize',
    post: async (ctx) => {
      if (ctx.result) {
        ctx.result = sanitizeToolResult(ctx.result, ctx.tool)
      }
      return ctx
    }
  },

  // 6. PII scrub — remove secrets from result
  {
    name: 'pii-scrub',
    post: async (ctx) => {
      if (ctx.result) {
        ctx.result = piiScrub(ctx.result)
      }
      return ctx
    }
  },

  // 7. Size cap — prevent context flooding (LLM04)
  {
    name: 'size-cap',
    post: async (ctx) => {
      const MAX = 16 * 1024  // 16KB
      if (ctx.result && ctx.result.length > MAX) {
        ctx.result = ctx.result.slice(0, MAX) + '\n[TRUNCATED — result exceeded 16KB cap]'
      }
      return ctx
    }
  },

  // 8. Audit log — every tool call logged (L0)
  {
    name: 'audit-log',
    post: async (ctx) => {
      auditLog({ tool: ctx.tool, agent: ctx.agentId, blast: ctx.blastScore, session: ctx.sessionId })
      return ctx
    }
  },
]
```

## Middleware execution (compose pattern)

```typescript
async function runWithMiddleware(ctx: ToolContext, execute: () => Promise<string>): Promise<string | MiddlewareReject> {
  // Pre-execution
  for (const mw of MIDDLEWARE_STACK.filter(m => m.pre)) {
    const result = await mw.pre!(ctx)
    if ('blocked' in result) return result   // short-circuit on block
    ctx = result
  }

  // Execute tool
  ctx.result = await execute()

  // Post-execution
  for (const mw of MIDDLEWARE_STACK.filter(m => m.post)) {
    const result = await mw.post!(ctx)
    if ('blocked' in result) return result
    ctx = result
  }

  return ctx.result!
}
```

## Middleware bypass rules (Tier A — never allowed)

```
- No middleware may be removed from the stack at runtime
- No tool call may bypass the stack by calling execute() directly
- YAMTAM_MIDDLEWARE_BYPASS env var = BLOCKED (exit 1, logged)
- Sub-agents inherit parent middleware stack — cannot reduce it
```

## Anti-Pattern Checklist

```
❌ Tool called directly without passing through middleware compose
❌ Middleware step removed "for performance" (injection scan is mandatory)
❌ Blast radius check skipped when YAMTAM_IRREVERSIBLE_OK is set globally
❌ Post-execution sanitize missing (result returned raw to agent)
❌ Size cap absent (context flooding via large tool result)
❌ Audit log not last in post-stack (truncation before audit = invisible tool call)
```

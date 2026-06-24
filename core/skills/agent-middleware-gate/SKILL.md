---
name: agent-middleware-gate
description: Intercept-layer skill for wrapping all agent tool calls through a sanitize-mutate-execute proxy pipeline. Onion middleware composition (koa), request/response interceptors (axios), scope-aware handler chains (express), near-zero-latency proxy routing (caddy), and in-memory pipe streams (piping-server). Implements core/scripts/tool-proxy.sh. Sources: koajs/koa, axios/axios, expressjs/express, caddyserver/caddy, nwtgck/piping-server.
origin: yana-ai — synthesized from koajs/koa, axios/axios, expressjs/express, caddyserver/caddy, nwtgck/piping-server
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.45
---

# /intercept-layer

## When to Use

- Every agent tool call must pass through intercept → sanitize → mutate → execute
- "The agent ran a command with unsafe params — how do we catch it before exec?"
- Need to auto-harden a command (add timeout, resource cap) instead of just blocking it
- Pipeline needs layers that act both before AND after execution (onion model)

## Do NOT use for

- In-process function calls with no shell/exec boundary
- Read-only introspection (no mutation needed)

---

## Architecture: Four-Phase Proxy Pipeline

```
Agent emits tool call
       │
       ▼
┌──────────────────────────────────────────┐
│  PHASE 1 — INTERCEPT                     │
│  Read raw command + args, log to audit   │
│  Source: koa onion — outer layer entry   │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│  PHASE 2 — SANITIZE  (Gate L2)           │
│  Strip injection chars (; | & ` $())     │
│  Auto-quote bare variables               │
│  Block subshell escape ($() <() `)       │
│  Source: axios request interceptor       │
└──────────────────┬───────────────────────┘
                   │ clean args
                   ▼
┌──────────────────────────────────────────┐
│  PHASE 3 — MUTATE  (Gate L1)             │
│  Auto-add missing safety config:         │
│    • timeout wrapper                     │
│    • ulimit memory cap                   │
│    • network flag if missing             │
│  Source: caddy handler chain mutation    │
└──────────────────┬───────────────────────┘
                   │ hardened command
                   ▼
           [tool executes]
                   │
                   ▼
┌──────────────────────────────────────────┐
│  PHASE 4 — RESPONSE INTERCEPT  (Gate L0) │
│  Sanitize output (strip PII / secrets)   │
│  Cap result size (16KB)                  │
│  Audit log result hash                   │
│  Source: axios response interceptor      │
└──────────────────────────────────────────┘
```

---

## Phase 1 — Onion Composition (koa pattern)

```typescript
// Koa's compose() — each middleware wraps the next layer
// Before-call logic runs top-down; after-call logic runs bottom-up
type Next = () => Promise<void>
type Middleware = (ctx: ToolContext, next: Next) => Promise<void>

function compose(middlewares: Middleware[]) {
  return function (ctx: ToolContext): Promise<void> {
    let index = -1

    function dispatch(i: number): Promise<void> {
      if (i <= index) return Promise.reject(new Error('next() called multiple times'))
      index = i
      const fn = middlewares[i]
      if (!fn) return Promise.resolve()  // end of chain → execute tool
      return Promise.resolve(fn(ctx, () => dispatch(i + 1)))
    }

    return dispatch(0)
  }
}

// Usage: wrap any layer — PRE logic runs before next(), POST logic after
const interceptLayer: Middleware = async (ctx, next) => {
  ctx.interceptedAt = Date.now()
  auditLog.record({ phase: 'intercept', tool: ctx.tool, args: ctx.args })

  await next()  // ← inner layers run here

  // POST: runs after tool execution and all inner layers complete
  auditLog.record({ phase: 'result', tool: ctx.tool, elapsed: Date.now() - ctx.interceptedAt })
}

// Rule: compose() order = outermost first, innermost = actual execute
// Rule: never call next() twice in the same middleware — throws
```

---

## Phase 2 — Sanitize (axios interceptor pattern)

```typescript
// Axios-style: register named interceptors that can mutate or reject
class InterceptorManager<T> {
  #handlers: Array<{ name: string; fn: (v: T) => T | Promise<T> }> = []

  use(name: string, fn: (v: T) => T | Promise<T>) {
    this.#handlers.push({ name, fn })
    return this  // chainable
  }

  async run(value: T): Promise<T> {
    let current = value
    for (const { name, fn } of this.#handlers) {
      current = await fn(current)
    }
    return current
  }
}

// Request (pre-exec) interceptors
const requestInterceptors = new InterceptorManager<ToolContext>()

requestInterceptors
  .use('strip-injection-chars', (ctx) => {
    const INJECTION_CHARS = /[;&|`$><\n]/g
    ctx.args = Object.fromEntries(
      Object.entries(ctx.args).map(([k, v]) => [
        k,
        typeof v === 'string' ? v.replace(INJECTION_CHARS, '') : v,
      ])
    )
    return ctx
  })
  .use('block-subshell', (ctx) => {
    const SUBSHELL = /\$\(|\`|<\(/
    const raw = JSON.stringify(ctx.args)
    if (SUBSHELL.test(raw)) {
      throw Object.assign(new Error('subshell escape attempt in args'), { gate: 'L2', exitCode: 3 })
    }
    return ctx
  })
  .use('auto-quote-vars', (ctx) => {
    // Bare $VAR in string args → "${VAR}" to prevent word splitting
    ctx.args = Object.fromEntries(
      Object.entries(ctx.args).map(([k, v]) => [
        k,
        typeof v === 'string' ? v.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, '"$${$1}"') : v,
      ])
    )
    return ctx
  })

// Response interceptors — post-exec output sanitize
const responseInterceptors = new InterceptorManager<ToolContext>()

responseInterceptors
  .use('strip-pii', (ctx) => {
    if (ctx.result) ctx.result = piiScrub(ctx.result)
    return ctx
  })
  .use('size-cap', (ctx) => {
    const MAX = 16 * 1024
    if (ctx.result && ctx.result.length > MAX) {
      ctx.result = ctx.result.slice(0, MAX) + '\n[TRUNCATED]'
    }
    return ctx
  })

// Rule: interceptors run in registration order — security checks must be first
// Rule: throw to abort pipeline; return mutated ctx to continue
```

---

## Phase 3 — Mutate (caddy handler chain pattern)

```typescript
// Caddy insight: match → handler chain → upstream
// Mutation adds missing safety config BEFORE exec, not just block/reject

interface MutationRule {
  match:  (ctx: ToolContext) => boolean
  mutate: (ctx: ToolContext) => ToolContext
}

const MUTATION_RULES: MutationRule[] = [
  {
    // Auto-add timeout if not present
    match:  (ctx) => ctx.tool === 'Bash' && !ctx.args.timeout,
    mutate: (ctx) => {
      ctx.args = { ...ctx.args, timeout: Number(process.env.YAMTAM_TOOL_TIMEOUT ?? 30000) }
      return ctx
    },
  },
  {
    // Auto-add --no-network for file-only operations
    match:  (ctx) => ctx.tool === 'Read' && !(ctx.args as any).url,
    mutate: (ctx) => {
      ;(ctx.args as any).__networkBlocked = true
      return ctx
    },
  },
  {
    // Auto-wrap destructive Bash commands with ulimit
    match:  (ctx) => ctx.tool === 'Bash' && /rm|chmod|chown/.test(String(ctx.args.command ?? '')),
    mutate: (ctx) => {
      const MAX_MEM_KB = process.env.YAMTAM_TOOL_MAX_MEM ?? '524288'  // 512MB
      ctx.args = {
        ...ctx.args,
        command: `ulimit -v ${MAX_MEM_KB}; ${ctx.args.command}`,
      }
      return ctx
    },
  },
]

function applyMutations(ctx: ToolContext): ToolContext {
  for (const rule of MUTATION_RULES) {
    if (rule.match(ctx)) ctx = rule.mutate(ctx)
  }
  return ctx
}

// Rule: mutate BEFORE block — give the command a chance to become safe
// Rule: all mutations must be logged to audit trail (what was added and why)
// Rule: mutation rules checked in order — first match wins (caddy matchers)
```

---

## Shell Proxy: tool-proxy.sh

The companion script at `core/scripts/tool-proxy.sh` — run every Bash tool call through it:

```bash
# Usage: bash core/scripts/tool-proxy.sh <command> [args...]
# Returns: exit 0 = safe + executed; exit 3 = sanitize block; exit 1 = mutate block

YAMTAM_TOOL_TIMEOUT=30
YAMTAM_TOOL_MAX_MEM=524288   # 512MB in KB

bash core/scripts/tool-proxy.sh "ls -la /tmp"
bash core/scripts/tool-proxy.sh "git diff HEAD"
# Blocked: bash core/scripts/tool-proxy.sh "cat file | bash"  ← exit 3
# Mutated: bash core/scripts/tool-proxy.sh "rm -rf /tmp/x"   ← ulimit added
```

See full implementation: `core/scripts/tool-proxy.sh`

---

## Phase 4 — Pipe-Through (piping-server pattern)

```typescript
// piping-server insight: stream data process-to-process via HTTP pipe
// No disk write — data flows in-memory. Useful for large tool results.

import { Transform } from 'stream'

class ToolResultPipe extends Transform {
  #scanned = 0
  readonly #maxBytes = 16 * 1024

  _transform(chunk: Buffer, _enc: string, cb: (err: Error | null, data?: Buffer) => void) {
    this.#scanned += chunk.length
    if (this.#scanned > this.#maxBytes) {
      this.push(Buffer.from('\n[TRUNCATED — 16KB cap]\n'))
      this.end()
      cb(null)
      return
    }
    // In-flight PII scan on streaming chunk — no buffering to disk
    const clean = chunk.toString().replace(/Bearer [A-Za-z0-9._-]+/g, '[REDACTED]')
    cb(null, Buffer.from(clean))
  }
}

// Pipe tool stdout through sanitize transform in-memory
async function pipedToolExec(cmd: string): Promise<string> {
  const { stdout } = await execAsync(cmd)
  const pipe = new ToolResultPipe()
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    pipe.on('data', c => chunks.push(c))
    pipe.on('end', () => resolve(Buffer.concat(chunks).toString()))
    pipe.on('error', reject)
    pipe.end(Buffer.from(stdout))
  })
}

// Rule: never write raw tool output to disk — pipe through sanitize transform
// Rule: streaming PII scan prevents large-result buffering in memory
```

---

## Express Scope: Global vs Tool-Specific Middleware

```typescript
// Express insight: global middleware vs router-scoped — apply the same here

// Global: every tool call
toolRouter.use(interceptLayer)        // all tools
toolRouter.use(sanitizeLayer)         // all tools

// Tool-specific: only Bash gets mutate layer (file tools don't need ulimit)
toolRouter.tool('Bash', mutateLayer)
toolRouter.tool('Bash', resourceCapLayer)

// Error middleware (always last — 4-arg signature)
toolRouter.use((err: Error, ctx: ToolContext, next: Next) => {
  auditLog.error({ tool: ctx.tool, err: err.message, gate: (err as any).gate })
  // Do NOT re-throw — error middleware terminates the chain
})

// Rule: error middleware must be LAST in the chain
// Rule: tool-specific middleware reduces blast radius vs applying everything globally
```

---

## Anti-Fake-Pass Checklist

```
❌ next() called after interceptor already threw (double-dispatch crash)
❌ Sanitize strips chars but doesn't re-validate after strip (second-order injection)
❌ Mutate adds ulimit but doesn't log the mutation to audit trail
❌ Response interceptor missing — raw tool output with PII returned to agent
❌ Pipe writes to /tmp instead of in-memory transform (disk trace left behind)
❌ Global middleware applied to file-read tools (ulimit on Read = wasted overhead)
❌ Error middleware not last — subsequent middleware never sees the error
❌ auto-quote-vars interceptor modifies URL args (breaks curl with $HOSTNAME in URL)
```

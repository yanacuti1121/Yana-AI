---
name: twirp-rpc-patterns
description: Twirp lightweight RPC over HTTP/1.1 with Protobuf or JSON transport. Service routing, error codes, middleware hooks, and no-proxy deployment for simple agent-to-agent calls. Sources: twitchtv/twirp (Apache-2.0).
origin: yana-ai — synthesized from twitchtv/twirp (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.50
---

# /twirp-rpc-patterns

## When to Use

- gRPC is overkill: no HTTP/2 infrastructure, no streaming required
- Simple request-response RPC with Protobuf encoding over plain HTTP
- Behind standard reverse proxies (nginx, Caddy) without grpc_pass config
- JSON fallback: same service works with both Protobuf and JSON clients

## Do NOT use for

- Bidirectional streaming (use [[grpc-streaming-rpc]])
- Browser clients without CORS concerns (Twirp JSON works, but REST is simpler)

---

## Twirp URL convention

```
POST /twirp/<package>.<Service>/<Method>
Content-Type: application/protobuf   (binary)
           or application/json       (human-readable fallback)
```

---

## Node.js Twirp server (twirp-ts)

```typescript
import { createServer }   from 'http'
import { TwirpServer, chainHooks } from 'twirp-ts'
import { AgentBus }       from './generated/agent_bus_twirp'  // generated from proto

const server = new TwirpServer({
  service: AgentBus,
  implementation: {
    async DispatchTask(ctx, req) {
      const taskId = `task-${Date.now()}`
      return { taskId, accepted: true }
    },

    async GetTaskStatus(ctx, req) {
      const status = await taskRegistry.get(req.taskId)
      if (!status) throw new TwirpError(TwirpErrorCode.NotFound, `task ${req.taskId} not found`)
      return { taskId: req.taskId, status }
    },
  },
  hooks: chainHooks(
    {
      requestReceived: async (ctx) => {
        ctx.agentId = ctx.req.headers['x-agent-id'] as string
        if (!ctx.agentId) throw new TwirpError(TwirpErrorCode.Unauthenticated, 'missing x-agent-id')
      },
    }
  ),
})

createServer((req, res) => server.httpHandler(req, res)).listen(8080)
```

---

## Twirp client (JSON transport)

```typescript
import fetch from 'node-fetch'

async function twirpCall<Req, Res>(
  baseUrl:  string,
  service:  string,
  method:   string,
  body:     Req,
  agentId:  string
): Promise<Res> {
  const url = `${baseUrl}/twirp/${service}/${method}`
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Id':   agentId,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`[twirp] ${err.code}: ${err.msg}`)
  }
  return res.json()
}

const ack = await twirpCall(
  'http://localhost:8080',
  'yamtam.AgentBus',
  'DispatchTask',
  { tool: 'bash', paramsJson: '{"cmd":"ls"}' },
  'did:yamtam:0xabc123'
)
```

---

## Twirp error codes

```typescript
import { TwirpError, TwirpErrorCode } from 'twirp-ts'

// Standard error codes (map to HTTP status):
// Canceled           → 408
// Unknown            → 500
// InvalidArgument    → 400
// NotFound           → 404
// AlreadyExists      → 409
// PermissionDenied   → 403
// Unauthenticated    → 401
// ResourceExhausted  → 429  ← rate limit
// Internal           → 500

throw new TwirpError(TwirpErrorCode.ResourceExhausted, 'rate limit exceeded')
```

---

## Anti-Fake-Pass Checklist

```
❌ Missing Content-Type: application/json → Twirp returns 415 Unsupported Media Type
❌ URL path case mismatch — Twirp routing is case-sensitive: /DispatchTask ≠ /dispatchtask
❌ Throwing plain Error in handler → becomes TwirpErrorCode.Internal with no details
❌ No authentication hook → any caller can invoke any method
❌ Protobuf and JSON clients mixed without content-type check → binary parsed as JSON
❌ TwirpErrorCode.ResourceExhausted not mapped to retry logic on client → no backoff
```

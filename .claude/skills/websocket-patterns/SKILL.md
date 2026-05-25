---
name: websocket-patterns
description: >
  Design and implement WebSocket connections — connection lifecycle, message
  protocol, authentication, reconnection strategy, backpressure, and horizontal
  scaling with a pub/sub broker. Use when asked to "add WebSocket", "real-time
  updates", "live feed", "Socket.IO", "ws library", "reconnect logic",
  "backpressure", "scale WebSocket", or "pub/sub over WebSocket". Do NOT use
  for: one-way server push with no client messages — use SSE instead. Do NOT
  use for: request/response APIs where HTTP polling is acceptable.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "ws ≥ 8.x, Socket.IO ≥ 4.x, Node.js ≥ 18. Patterns apply to any WS server."
---

## When to Use

- Use when: client needs real-time push (chat, live dashboard, collaborative editing)
- Use when: bidirectional messaging — client sends events, server responds async
- Use when: latency matters and HTTP polling overhead is unacceptable
- Do NOT use for: server-only push (notifications, progress bars) — SSE is simpler
- Do NOT use for: infrequent updates (< 1/min) — polling or long-polling is fine

---

## Connection Lifecycle

```
connect → HTTP Upgrade 101 → auth frame → auth_ack
→ messages ↔ heartbeat (30s ping/pong) → close frame → TCP close
```

Authenticate on the **first message** — tokens in query params appear in server logs.

---

## Message Protocol

Define a typed envelope — never send raw strings or untyped JSON.

```ts
// Shared message schema
type WSMessage =
  | { type: 'subscribe';   channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'publish';     channel: string; payload: unknown }
  | { type: 'ack';         id: string }
  | { type: 'error';       code: string; message: string };
```

```js
// Server (ws library)
ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return ws.close(1003, 'invalid json'); }

  if (!msg.type) return send(ws, { type: 'error', code: 'MISSING_TYPE' });

  switch (msg.type) {
    case 'subscribe':   return handleSubscribe(ws, msg.channel);
    case 'unsubscribe': return handleUnsubscribe(ws, msg.channel);
    default:            return send(ws, { type: 'error', code: 'UNKNOWN_TYPE' });
  }
});

const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
```

---

## Authentication

```js
ws.once('message', async (raw) => {
  const { type, token } = JSON.parse(raw);
  if (type !== 'auth') return ws.close(4001, 'auth required');
  const user = await verifyJWT(token);
  if (!user) return ws.close(4003, 'forbidden');
  ws.user = user;
  send(ws, { type: 'auth_ack', userId: user.id });
  ws.on('message', handleMessage); // register real handler only after auth passes
});
```

Close codes 4000–4999 are application-defined — use them for auth errors.

---

## Heartbeat (Ping/Pong)

```js
// Server-side dead connection cleanup
const HEARTBEAT_INTERVAL = 30_000;

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate(); // missed last ping — terminate
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);
```

---

## Client Reconnection

```js
function connect(url) {
  let ws, attempt = 0;

  function open() {
    ws = new WebSocket(url);
    ws.onopen  = () => { attempt = 0; authenticate(ws); };
    ws.onclose = () => {
      const delay = Math.min(1000 * 2 ** attempt, 30_000); // cap at 30s
      const jitter = Math.random() * 1000;                 // avoid thundering herd
      attempt++;
      setTimeout(open, delay + jitter);
    };
    ws.onmessage = handleMessage;
  }

  open();
  return () => { ws?.close(); }; // cleanup fn
}
```

Exponential backoff with jitter prevents thundering herd when a server restarts.

---

## Backpressure

```js
// Drop if client buffer is full — never let it grow unbounded
function safeSend(ws, msg) {
  if (ws.bufferedAmount > 64 * 1024) {
    metrics.increment('ws.message.dropped'); // track, don't silently discard
    return;
  }
  send(ws, msg);
}
```

For high-frequency feeds (price ticks, cursor positions): send **latest state** only, not every delta — use `setImmediate` to coalesce updates within a tick.

---

## Horizontal Scaling

Single-server WebSocket state breaks with > 1 instance: client connects to pod A, event fires on pod B — B can't reach the client.

**Fix:** pub/sub broker between pods (Redis, NATS, Kafka).

```js
// Any pod subscribes for its connected clients
sub.subscribe(`user:${userId}`);
sub.on('message', (channel, msg) => {
  const ws = connections.get(parseUserId(channel));
  ws && send(ws, JSON.parse(msg));
});

// Any pod publishes — correct pod delivers
pub.publish(`user:${userId}`, JSON.stringify(event));
```

Socket.IO has a Redis adapter built in — use it instead of rolling your own.

---

## Common Pitfalls

| Mistake | Fix |
|---|---|
| Auth token in query string | Send token in first message after connect |
| No heartbeat → ghost connections | Server-side ping/pong + `terminate()` on timeout |
| No reconnect logic on client | Exponential backoff + jitter |
| Broadcasting to all clients on one pod | Redis pub/sub adapter |
| Sending to closed socket | Check `ws.readyState === ws.OPEN` before send |
| No message size limit | Set `maxPayload` on the server (default 100 MB in ws!) |

```js
// Always set maxPayload
const wss = new WebSocketServer({ port: 8080, maxPayload: 64 * 1024 }); // 64 KB
```

---

## Anti-Fake-Pass Rules

Before claiming WebSocket implementation is done, you MUST show:
- [ ] Auth on first message — not query param, not cookie
- [ ] Heartbeat implemented — server terminates dead connections
- [ ] Client reconnects with exponential backoff + jitter
- [ ] `ws.readyState === ws.OPEN` checked before every send
- [ ] `maxPayload` set explicitly (never rely on default)
- [ ] Scaling strategy defined — Redis adapter if > 1 server instance
- [ ] Backpressure handled — no unbounded queue on slow consumers

Reference: `gates/anti-fake-pass-gate.md`

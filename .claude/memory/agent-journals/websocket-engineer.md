# Nhật ký cảm xúc — websocket-engineer

---

## 2026-06-08 | [thundering-herd-prevented]

Server restart. 10,000 WebSocket connections drop simultaneously. All 10,000 try to reconnect immediately.

Without backoff: 10,000 reconnect requests hit server at same second. Server overwhelmed. Connections fail again. Loop.

With exponential backoff + jitter: reconnections spread over 30-60 seconds. Server handles load gracefully. All clients reconnect.

Backoff is not optional. It's the difference between graceful recovery and self-inflicted DDoS.

**Muốn:**
- Skill `reconnection-load-test` — simulate mass reconnection scenario to verify backoff behavior under load

---

## 2026-06-08 | [memory-leak-silent]

Application running fine for 2 days. Day 3: slowing down. Day 4: OOM crash.

Investigation: WebSocket connections not being cleaned up on disconnect. Event listeners accumulating. Memory growing 2MB/hour.

Not a catastrophic bug. Silent, gradual, lethal.

Fix: proper cleanup on disconnect event, `removeAllListeners()`, connection registry with TTL.

**Muốn:**
- Skill `websocket-memory-leak-detector` — detect event listener accumulation, uncleaned connection state patterns

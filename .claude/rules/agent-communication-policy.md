**Rule:** agent-communication-policy
**Status:** REVIEWED
**Gate:** L0 — all inter-agent messages are logged
**Source:** yamtam-engine (agent-message-bus.sh), RFC 7519 (JWT claims model), NIST SP 800-207 (zero-trust)

---

# Agent Communication Policy

## Principle

All communication between YAMTAM agents MUST use the structured JSON message format defined below. No agent may communicate with another via shared global variables, unstructured stdout, or direct filesystem writes outside `core/bus/`. Every message is logged and integrity-checked.

## Canonical Message Format

```json
{
  "id":       "<uuid-v4>",
  "from":     "<agent-name>",
  "to":       "<agent-name> | *",
  "type":     "REQUEST | RESPONSE | VETO | BROADCAST | HEARTBEAT",
  "subject":  "<topic-slug>",
  "payload":  {},
  "ts":       "<ISO-8601-UTC>",
  "nonce":    "<16-hex-chars>",
  "ttl":      300,
  "sig":      "<sha256(payload-json)>"
}
```

## Field Constraints

```
id:       required, UUID v4, unique globally, used for deduplication
from:     required, must match a registered agent name in core/agents/
to:       required, "*" for broadcast, specific agent name for direct
type:     required, one of REQUEST | RESPONSE | VETO | BROADCAST | HEARTBEAT
subject:  required, kebab-case slug, max 64 chars (e.g. "commit-gate", "pr-review")
payload:  required, valid JSON object, max 16KB (enforced by agent-message-bus.sh)
ts:       required, UTC ISO-8601, must be within ±60s of recipient's clock
nonce:    required, 16-char hex, prevents replay (bus rejects seen nonces for TTL window)
ttl:      required, seconds until message expires (default 300, max 3600)
sig:      required, SHA-256 of the serialized payload field (integrity check)
```

## Message Types

```
REQUEST:    Agent A asks Agent B to perform work or cast a vote
RESPONSE:   Agent B replies to a REQUEST (must include original message id in payload.request_id)
VETO:       Tier-1 agent blocks an action (broadcast to all, initiator receives exit 2)
BROADCAST:  Informational — all agents receive, no response expected
HEARTBEAT:  Agent announces it is alive (sent every 30s, recipient timeout = 90s)
```

## Replay Attack Prevention

```
1. nonce is stored in core/bus/seen-nonces/<agent>/<nonce> for TTL duration
2. Any message with a nonce already in seen-nonces is dropped silently
3. ts outside ±60s window is rejected with WARN log (clock skew or replay)
4. Message consumed (moved to processed/) immediately on receipt — no double-delivery
```

## Message Size Limits

```
Total message:    16 KB (enforced by agent-message-bus.sh check_msg_size())
payload field:    14 KB max (leaves room for envelope fields)
subject length:   64 characters
from/to length:   64 characters
Oversized messages: rejected at send time (exit 1) — never written to mailbox
```

## Delivery Guarantees

```
At-most-once: file renamed atomically (tmp → final) — no partial writes
No guaranteed delivery: if recipient is offline, message waits in inbox until TTL
FIFO per mailbox: messages processed in timestamp order (filename sort)
Broadcast: delivered to all current mailboxes at time of send — not new agents
```

## Mailbox Layout

```
core/bus/
  mailboxes/
    <agent-name>/
      inbox/         ← unread messages (JSON files, named: <ts>_<id>.json)
      processed/     ← consumed messages (kept for audit, 7-day retention)
  votes/             ← swarm-orchestrator vote state per request_id
  seen-nonces/       ← replay-prevention nonce registry
```

## Security Properties

```
□ sig field prevents payload tampering in transit
□ nonce + ttl prevent replay attacks
□ ts ±60s window prevents delayed-delivery attacks
□ Mailboxes readable only by the owning agent (0700 permissions)
□ processed/ kept for 7 days for audit trail
□ No agent may read another agent's inbox directly (only bus script can deliver)
```

## Anti-Pattern Checklist

```
❌ Agent-to-agent communication via shared global env var
❌ Agent writes directly to another agent's inbox/ (bypasses bus integrity checks)
❌ Message sent without sig field (payload tamper goes undetected)
❌ nonce reused across messages (replay protection broken)
❌ TTL set to 0 or missing (messages never expire = mailbox fills indefinitely)
❌ payload > 16KB sent (agent-message-bus.sh rejects it — caller gets exit 1)
❌ RESPONSE sent without payload.request_id (can't correlate request→response)
❌ processed/ directory deleted or never retained (audit trail destroyed)
```

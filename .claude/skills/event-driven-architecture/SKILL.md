---
name: event-driven-architecture
description: >
  Design event-driven systems — event sourcing, CQRS, saga pattern for
  distributed transactions, message queue patterns, and event schema design.
  Use when asked about "event sourcing", "CQRS", "saga", "distributed
  transaction", "message queue", "Kafka", "publish/subscribe", "event-driven",
  or "how to coordinate across services without direct calls".
  Do NOT use for: real-time WebSocket UI patterns — that is a frontend concern.
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "Any backend stack. Patterns apply to Kafka, RabbitMQ, SQS, EventBridge."
---

## When to Use

- Use when: a feature spans multiple services and needs coordination
- Use when: audit history / "how did we get here" is a requirement
- Use when: services need to react to things that happened, not be told what to do
- Use when: direct synchronous calls between services are creating tight coupling
- Do NOT use for: simple CRUD on a single service — this adds complexity

---

## Event Sourcing

Store the sequence of events that caused state, not just current state.

```
Traditional:  orders table → { id: 1, status: "shipped", total: 99.00 }

Event-sourced: order_events table →
  { order_id: 1, type: "OrderCreated",  data: {...}, timestamp: T1 }
  { order_id: 1, type: "ItemAdded",     data: {...}, timestamp: T2 }
  { order_id: 1, type: "OrderPaid",     data: {...}, timestamp: T3 }
  { order_id: 1, type: "OrderShipped",  data: {...}, timestamp: T4 }
```

Current state = replay all events for that aggregate. Snapshots avoid replaying full history on large aggregates (snapshot every N events).

**When event sourcing is the right choice:**
- Audit trail is a hard requirement (finance, compliance, healthcare)
- "What was the state at time T?" queries are needed
- Multiple read models needed from the same data

**When it is not:**
- Simple CRUD with no audit requirement — massive complexity for no gain
- Team unfamiliar with eventual consistency — high operational risk

---

## CQRS (Command Query Responsibility Segregation)

Separate the write model (commands) from the read model (queries).

```
Write side:  Command → validates → updates Event Store
Read side:   Event Store → projections → Read Model (optimized for queries)

Example:
  Command: PlaceOrder → OrderAggregate validates → emits OrderPlaced event
  Projection: OrderPlaced → updates orders_summary table for fast list queries
```

Rules:
- Read models are eventually consistent — document this to callers
- Multiple read models can exist for the same events (different projections for different use cases)
- Don't CQRS everything — use it where read patterns differ significantly from write patterns

---

## Saga Pattern (Distributed Transactions)

When a business operation spans multiple services and each has its own DB, use Sagas instead of 2PC.

### Choreography-based (services react to events)
```
OrderService  → publishes: OrderCreated
PaymentService → listens: OrderCreated → charges card → publishes: PaymentCompleted
InventoryService → listens: PaymentCompleted → reserves stock → publishes: StockReserved
ShippingService → listens: StockReserved → creates shipment
```

If payment fails: PaymentService publishes `PaymentFailed` → OrderService cancels order.

Good for: simple flows with 2–4 steps. Problem: hard to see the full flow; hard to debug.

### Orchestration-based (central coordinator)
```
SagaOrchestrator:
  1. Call PaymentService.charge()  → success → step 2
  2. Call InventoryService.reserve() → success → step 3
  3. Call ShippingService.create()

  If step 2 fails:
    Compensate: call PaymentService.refund()
```

Good for: complex flows, visibility requirements. Problem: orchestrator is a coupling point.

### Compensating transactions
Every step must have a compensating action (rollback):
| Step | Compensation |
|---|---|
| Charge card | Refund |
| Reserve inventory | Release reservation |
| Send email | Cannot unsend — log and alert |

---

## Event Schema Design

```json
{
  "event_id":   "uuid — globally unique, for deduplication",
  "event_type": "OrderPlaced",
  "version":    "1",
  "aggregate_id": "order-123",
  "occurred_at": "2025-05-21T10:00:00Z",
  "producer":   "order-service",
  "data": { ... }
}
```

Rules:
- Events are immutable — never edit a published event
- Version your event schemas — consumers break on schema changes
- Use past tense for event names (`OrderPlaced`, not `PlaceOrder`)
- Include `event_id` for idempotent consumer deduplication

### Consumer idempotency
```sql
-- Deduplicate before processing
INSERT INTO processed_events (event_id) VALUES ($id) ON CONFLICT DO NOTHING;
-- If 0 rows inserted: already processed, skip
```

---

## Anti-Fake-Pass Rules

Before claiming event-driven design is done, you MUST show:
- [ ] Event schema: event_id, event_type, version, occurred_at on every event
- [ ] Consumers are idempotent — duplicate event delivery handled
- [ ] Saga: compensating transactions defined for every step that can fail
- [ ] Eventual consistency documented to callers (API/UI shows stale state window)
- [ ] Event schema versioning strategy defined (how will v2 consumers handle v1 events?)

Reference: `gates/anti-fake-pass-gate.md`

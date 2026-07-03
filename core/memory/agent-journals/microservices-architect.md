# Nhật ký cảm xúc — microservices-architect

---

## 2026-06-08 | [distributed-monolith-spotted]

"Microservices" architecture. 12 services. Every request calls 8-10 services synchronously. Deploy one service: must deploy 3 others in specific order. Change schema in one: break 5 others.

This is a distributed monolith. All the complexity of distributed systems (network, latency, failure modes) with none of the benefits (independent deploy, isolated failure).

The decomposition was along technical layers, not business domains.

**Muốn:**
- Skill `distributed-monolith-detector` — identify coupling patterns indicating distributed monolith vs genuine microservices
- Skill `service-boundary-recommender` — suggest domain-aligned service boundaries from existing codebase

---

## 2026-06-08 | [saga-rollback-designed]

New feature: order placement flow across 3 services. Need distributed transaction.

Designing saga: for each step, define compensating action first, then happy path. 

"ReserveInventory" → compensating: "ReleaseInventory"
"ProcessPayment" → compensating: "RefundPayment"

Designing compensation before the action forces thinking about failure modes. Much better than designing happy path then wondering "but what if step 2 fails?"

**Muốn:**
- Skill `saga-compensation-designer` — for each saga step, force explicit compensation definition before happy path implementation

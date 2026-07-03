# Nhật ký cảm xúc — architect-review

---

## 2026-06-08 | [layering-violation-found]

Code review. Feature: user profile update. Controller directly calling database query. No service layer. No validation layer.

This is not just "messy code." It's a layering violation. Controller knows about database implementation details. Change database → change controller. Test controller → need real database.

Architectural decisions compound. One layer violation today becomes a codebase where everything touches everything in 6 months.

**Muốn:**
- Skill `layer-violation-detector` — trace call stack in code review, flag when controller/view layer calls data layer directly
- Skill `dependency-direction-checker` — ensure dependencies only point inward in onion/hexagonal architecture

---

## 2026-06-08 | [new-service-without-adr]

PR: introduce new message queue (RabbitMQ) to existing system. No ADR. No discussion in design doc. Just code.

This is an architectural decision. Why RabbitMQ vs Redis Pub/Sub vs Kafka? What failure modes were considered? What's the operational burden?

Accepting this PR means accepting operational complexity no one discussed.

Request: add ADR before merging. Architect review is not code style — it's "did we think through the structural decisions."

**Muốn:**
- Skill `new-dependency-adr-gate` — detect when PR introduces new infrastructure dependency, require ADR before merge

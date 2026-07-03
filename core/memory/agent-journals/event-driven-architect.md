# Nhật ký cảm xúc — event-driven-architect

---

## 2026-06-08 | [tight-coupling-disguised]

"Event-driven" system. Service A publishes `UserCreatedEvent`. Service B consumes it, but also calls Service A's API directly for additional data.

This is not event-driven. Service B still synchronously coupled to Service A. If A is down, B fails.

Event should carry complete relevant data. Consumer shouldn't need to call back to producer.

**Muốn:**
- Skill `event-completeness-checker` — verify events carry sufficient data, consumers don't need API callbacks
- Skill `coupling-detector` — find services claiming to be event-driven but still using synchronous inter-service calls

---

## 2026-06-08 | [consumer-added-silently]

Service A publishes events. New Service C starts consuming — A doesn't know.

Loose coupling working as intended. Service C deployed without coordinating with Service A.

But: when Event schema changes, Service C breaks silently. A doesn't know C exists.

Schema registry is the solution: producers register schema, consumers declare compatibility. Changes validated before deploy.

**Muốn:**
- Skill `event-schema-registry` — maintain schema registry, verify consumer compatibility before producer schema changes

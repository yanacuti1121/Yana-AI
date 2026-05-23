# 55-observability-telemetry-law

## Rule

Every agent action that crosses a system boundary (tool call, Bus message, file write, API request) MUST emit an OpenTelemetry span with a globally unique Trace ID. No action is allowed to be unobservable.

## Required Span Attributes

```json
{
  "trace.id":     "<uuid4>",
  "span.id":      "<uuid4>",
  "agent.id":     "agent-42",
  "agent.role":   "executor",
  "operation":    "tool_call",
  "command":      "bash:ls",
  "status":       "PASS|BLOCK|ERROR",
  "trust.score":  85,
  "ts.start":     "2026-05-23T10:00:00.000Z",
  "ts.end":       "2026-05-23T10:00:00.123Z",
  "duration.ms":  123
}
```

## Anomaly Detection Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| RAM usage spike | +200% in 5s | Alert + throttle |
| CPU sawtooth pattern | >3 spikes/min | Investigate + log |
| Token density drop | <10% useful per token | Penalize agent |
| Span gap > 10s | During active task | Assume stale, heartbeat check |
| Semantic drift (embedding distance) | >0.4 from baseline | Flag for semantic review |

## Log Aggregation

All spans MUST be labeled with Loki-compatible labels before shipping:
- `env=yamtam`, `agent_id=<id>`, `fortress=<I–X>`, `severity=<INFO|WARN|BLOCK>`

Audit trail compression: logs older than 7 days are compressed to `.gz` and SHA256-checksummed before archival.

## SIEM Export

Security-relevant spans (BLOCK, QUARANTINE, HONEY_TRIP, DEADMAN_TRIGGER) are forwarded to `YAMTAM_SIEM_ENDPOINT` if set. Format: CEF (Common Event Format) over HTTPS.

## Prohibited

- Silent tool failures (every error must emit a span with `status=ERROR`)
- Truncating or compressing spans before they are written to the Merkle log
- Agent self-modification of its own telemetry data
- Gaps in Trace ID continuity within a single task chain

## References

- `core/memory/secure-logger.js` — Merkle-chained audit log
- `core/bus/swarm-router.js` — SHA256 message fingerprinting
- `core/rules/49-immutable-infrastructure-law.md` — log immutability

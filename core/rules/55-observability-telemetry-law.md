# 55-observability-telemetry-law

**Status:** REVIEWED (rewritten 2026-07-04 — see "What changed" below)

## Rule

Every tool call MUST be logged in a way that's tamper-evident and independently verifiable. This is real and already running — every `PostToolUse` event is written to a hash-chained JSONL log, and a broken chain is detectable without trusting the log itself.

## Real Enforcement

| Mechanism | File | What it does |
|---|---|---|
| Hash-chain audit log | `core/hooks/audit-log.sh` | `PostToolUse` hook, live in `.claude/settings.json`. Writes one JSONL line per tool call to `.claude/state/audit-chain.log` |
| Chain verification | `core/scripts/verify-audit-chain.sh` | Recomputes each entry's hash and checks it against the stored value and the next entry's `prev_hash` — any tampering breaks the chain, detectable independently |
| Secret masking | `audit-log.sh`'s own redaction step | File paths matching `.env`/`.pem`/`.key`/`.secret`/`.cred`, or content matching `SECRET`/`TOKEN`/`PASSWORD`/`API_KEY`/`PRIVATE_KEY`/`BEARER` → logged as `[REDACTED]`, not verbatim |
| Budget threshold alerts | `core/hooks/budget-sentinel.sh` | Real percentage-based alerts at 50% (info) / 80% (warn) / 90% (single-agent mode) / 95% (critical) of token budget — not the RAM/CPU/embedding-drift metrics this rule used to claim |

## Real Log Schema (matches `audit-log.sh`'s actual JSONL output)

```json
{"ts":"2026-07-04T10:00:00Z","hook":"audit-log","tool":"Bash","agent":"manual","input":"...","decision":"allow","prev_hash":"<sha256>","hash":"<sha256>"}
```

`hash` = SHA-256 of `ts|hook|tool|agent|input|decision` concatenated with `prev_hash`. First entry uses a fixed `YANA_GENESIS` sentinel as `prev_hash` — matches `audit-hardening-policy.md`'s hash-chain design exactly, because this hook is that design's actual implementation.

## Prohibited

- Silent tool failures — every logged action gets a JSONL entry, `decision` field records the outcome
- Modifying or deleting an existing line in `.claude/state/audit-chain.log` — the chain design makes this detectable, not just discouraged (see `verify-audit-chain.sh`)
- Claiming a tool call was "logged" without the corresponding JSONL entry existing

## References

- `core/rules/audit-hardening-policy.md` — the hash-chain design this hook implements
- `core/hooks/audit-log.sh`, `core/scripts/verify-audit-chain.sh` — the real mechanism
- `core/hooks/budget-sentinel.sh` — real threshold-based budget alerts
- `core/rules/49-immutable-infrastructure-law.md` — log immutability

## What changed

Before this rewrite: OpenTelemetry spans with UUID `trace.id`/`span.id`, a `trust.score` field implying a live per-agent reputation system, Loki-compatible labels with a `fortress=<I–X>` scheme that appears nowhere else in this repo, anomaly-detection triggers for "RAM usage spike," "CPU sawtooth pattern," "token density drop," and "semantic drift (embedding distance)," a CEF-over-HTTPS SIEM export via `YANA_SIEM_ENDPOINT`, and references to `core/bus/swarm-router.js`'s "SHA256 message fingerprinting" as the enforcing mechanism. Grepped `core/` and `.claude/` for every one of these terms (OpenTelemetry, `trace.id`, `fortress=`, `YANA_SIEM_ENDPOINT`, the four anomaly metrics) — zero real implementation anywhere. The actual observability mechanism was always `audit-log.sh`'s hash-chain JSONL log, which predates this rewrite and didn't need any of the above — this rewrite just describes it instead of a fictional telemetry pipeline.

This follows the same pattern already applied to `core/rules/50-financial-deadman-switch-law.md` and `62-sovereign-overlord-gate-law.md` (2026-07-03) and `56-circuit-breaker-law.md` (2026-07-04) — all four described mechanisms borrowed from a "swarm of 87 agents" narrative that was never built; see `agent-communication-policy.md` for the fuller account of why.

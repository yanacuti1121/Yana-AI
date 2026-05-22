# YAMTAM ENGINE — Audit Hardening Policy
# Source: google/trillian Verifiable Log architecture (Apache 2.0) — github.com/google/trillian
# Tier: TIER 1 — SECURITY

**Status:** Active  
**Scope:** secure-logger.sh, all audit log consumers, all agents reading/writing logs

---

## Core Principle (Trillian-inspired)

> A log entry that can be deleted without detection is not a log entry — it is theater.

Every audit log entry MUST form a cryptographic hash-chain with the previous entry.
If any line is deleted or modified, the chain breaks and the tampering is immediately detectable.

---

## Hash-Chain Log Format

Each log line written by `secure-logger.sh` MUST include:

```
TIMESTAMP | session=SESSION | commit=GIT_COMMIT | EVENT_TYPE | MESSAGE | prev=PREV_HASH | hash=THIS_HASH
```

Where:
- `PREV_HASH` = SHA-256 of the previous log line (raw text, no newline)
- `THIS_HASH` = SHA-256 of: `TIMESTAMP|SESSION|GIT_COMMIT|EVENT_TYPE|MESSAGE|PREV_HASH`
- First entry uses `prev=GENESIS` (fixed sentinel)

---

## Chain Verification

`verify-audit-chain.sh` MUST:

```
For each line N:
  1. Recompute SHA-256(line N without hash= field)
  2. Compare to stored hash= value
  3. Compare line N's hash= to line N+1's prev= value
  4. Any mismatch → CHAIN_BROKEN alert
```

Run verification:
```bash
bash core/scripts/verify-audit-chain.sh
```

Exit codes:
- `0` — chain intact
- `1` — chain broken (tampering detected)
- `2` — log file not found or malformed

---

## Tamper Response

If `verify-audit-chain.sh` exits 1:

```
[yamtam/audit-hardening] CHAIN BROKEN — log tampering detected
  Line     : <N>
  Expected : <expected hash>
  Got      : <stored hash>
  Action   : ALL agent command execution LOCKED pending human review
  Gate     : L0 (absolute — overrides all other gates)
```

**Agent behavior on CHAIN_BROKEN:**
- Emit the alert to stdout + stderr
- Write LOCKFILE at `core/state/AUDIT_BREACH.lock`
- Refuse to execute any further commands until `core/state/AUDIT_BREACH.lock` is manually removed
- Log the detection attempt itself to a **separate** integrity log (`audit-integrity.log`)

---

## Forbidden Actions (absolute, Tier 0)

```
❌ Agent MUST NOT delete any line from agent-actions.log
❌ Agent MUST NOT truncate agent-actions.log directly (log-rotate.sh does this safely)
❌ Agent MUST NOT modify an existing log line (only append via secure-logger.sh)
❌ Agent MUST NOT disable chain verification "for performance"
❌ Agent MUST NOT remove AUDIT_BREACH.lock without explicit user instruction
```

---

## Log Retention Policy

```
Active log     : core/memory/audit/agent-actions.log  (≤ 5MB, then log-rotate.sh)
Archives       : releases/logs/audit-*.log.gz          (keep 20 most recent)
Integrity log  : core/memory/audit/audit-integrity.log (never rotated — chain of chain)
```

The integrity log itself is hash-chained using the same algorithm.  
It is excluded from `log-rotate.sh` rotation.

---

## Implementation Note

`secure-logger.sh` must be updated to compute and append `prev=` + `hash=` fields.
Until that upgrade is complete, mark all log entries as `hash=PENDING` and
`prev=LEGACY` — the chain verifier treats these as a pre-chain baseline, not a breach.

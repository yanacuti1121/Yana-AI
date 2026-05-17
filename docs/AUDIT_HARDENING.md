# YAMTAM ENGINE — Audit Hardening: Hash-Chain Log

**Version:** 1.0
**Status:** Active
**Files:** `core/hooks/audit-log.sh`, `core/scripts/verify-audit-chain.sh`

---

## Problem

The previous `audit-log.sh` wrote plain-text lines to `audit.log`. Anyone with write access to `.claude/state/` could silently edit, delete, or insert entries. There was no way to detect tampering after the fact.

---

## Solution: Hash-Chain Audit Log

Each log entry is a JSONL line. Its `hash` field is the SHA-256 digest of the entry's own content concatenated with the previous entry's hash:

```
entry_n.hash = SHA256(entry_n.content + entry_n-1.hash)
```

The first entry uses a known genesis value:

```
entry_1.prev_hash = SHA256("YAMTAM_GENESIS")
```

If any entry is modified, its hash no longer matches — and every subsequent entry's `prev_hash` also breaks, making tampering immediately detectable.

---

## Log Format

Each line is a JSON object (`audit-chain.log`):

```json
{
  "ts":        "2026-05-17T12:00:00Z",
  "hook":      "audit-log",
  "tool":      "Read",
  "agent":     "manual",
  "input":     "{\"file_path\":\"README.md\"}",
  "decision":  "allow",
  "prev_hash": "a3f9...",
  "hash":      "7c1d..."
}
```

| Field       | Description                                      |
|-------------|--------------------------------------------------|
| `ts`        | UTC timestamp (ISO 8601)                         |
| `hook`      | Hook that wrote the entry (`audit-log`)          |
| `tool`      | Claude Code tool that was called                 |
| `agent`     | Agent name or `manual`                           |
| `input`     | Truncated tool input (secrets masked)            |
| `decision`  | `allow` / `warn` / `block`                       |
| `prev_hash` | Hash of previous entry (genesis hash if first)   |
| `hash`      | SHA-256 of `content + prev_hash`                 |

---

## Secret Masking

The following are masked as `[REDACTED]` before writing:

- File paths containing `.env`, `.pem`, `.key`, `.secret`, `.cred`
- Inputs containing `SECRET`, `TOKEN`, `PASSWORD`, `API_KEY`, `PRIVATE_KEY`, `BEARER`

No credential material ever enters the log.

---

## Verifying Integrity

```bash
bash core/scripts/verify-audit-chain.sh
```

- **Exit 0**: chain intact, entry count printed.
- **Exit 1**: first broken entry printed with expected vs. stored hashes.

Run after any suspicious activity or before incident review.

---

## Viewing the Log

```bash
bash core/scripts/view-audit.sh
```

Prints entries in human-readable form. Does not verify integrity — run `verify-audit-chain.sh` separately.

---

## Limitations

- Hash-chaining prevents silent tampering but does NOT prevent deletion of the entire log file.
- The log is `.gitignore`d (`.claude/state/`) — it is not version-controlled.
- An attacker with full filesystem access can recreate a valid chain from scratch. The chain is evidence of integrity for normal operation, not a forensic guarantee under adversarial root access.

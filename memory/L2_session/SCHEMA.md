# YAMTAM L2 Session Memory — Schema v1.0

Session facts live only for the current work session.
They are cleared by `clear-session.sh` at the start of each session or on demand.
Use L2 for: current task context, temporary decisions, in-progress state, notes-to-self.
Use L1 for: facts that should survive across sessions.

---

## Required Fields

```yaml
---
id:        <short slug, e.g. "s-auth-decision">
statement: <one sentence — the fact itself>
source:    <"agent" | "user:HH:MM" | "inference">
---
```

## Optional Fields

```yaml
tags:      [tag1, tag2]
evidence:  <path or quoted excerpt>
---
```

## Differences from L1

| Property | L1 Atomic | L2 Session |
|----------|-----------|------------|
| Persistence | Permanent (git-tracked) | Session only (gitignored) |
| Confidence | Required, promoted manually | Not used — all session facts are provisional |
| Scope | Required (YAMTAM / product / both) | Implied: current session |
| expires_at | Optional date | Not used — expires with session |
| Ceremony | High | Low — fast writes |

## Hard Limits

- No secrets, tokens, credentials, or PII
- No network calls
- Facts here are provisional — do not use as authoritative source without L1 promotion
- To promote a session fact to L1: run `bash core/scripts/add-fact.sh` and copy the statement

## Example Fact File

```markdown
---
id: s-api-design-decision
statement: The auth endpoint will use short-lived JWTs (15 min) with refresh tokens stored in httpOnly cookies.
source: user:14:32
tags: [auth, api-design]
evidence: discussed in current session — not yet in PRD
---

Decision reached during current work session. Promote to L1 if it should persist.
```

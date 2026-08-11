# Yana AI L1 Atomic Memory — Schema v1.0

Each fact lives in its own `.md` file with this YAML frontmatter.
Do not store secrets, tokens, credentials, or personally identifiable data.

---

## Required Fields

```yaml
---
id:         <uuid or short slug, e.g. "fact-001">
type:       <fact | decision | constraint | assumption | observation>
statement:  <one sentence — the fact itself>
source:     <where this came from: "user:2026-05-17" | "git-log:abc123" | "file:path/to/file.md">
confidence: <unverified | low | medium | high>
scope:      <Yana AI | product | both>
---
```

## Optional Fields

```yaml
expires_at:            <YYYY-MM-DD — when this fact should be re-verified; omit if perpetual>
tags:                  [tag1, tag2, tag3]  # short labels for tag-based search; lowercase, hyphenated
forbidden_assumptions: <list of things that must NOT be inferred from this fact>
evidence:              <path or quoted excerpt that backs the statement>
evidence_file:         <repo-relative path to the ONE file this fact's evidence_hash was computed
                        against — set only when `evidence` names a real file. Distinct from `evidence`
                        (which stays free text/excerpt) so tooling has an unambiguous path to re-hash.>
evidence_hash:         <SHA-256 of evidence_file's content at the moment this fact was written — lets
                        verify-fact-freshness.sh detect when the cited file has since changed, instead
                        of trusting a `source`/`evidence` citation forever. Set together, never by hand
                        — add-fact.sh computes both automatically when `evidence` resolves to a real
                        file on disk.>
superseded_by:         <id of the fact that replaced this one>
```

## Tags

Tags are short, lowercase, hyphenated labels used to group and filter facts.
Examples: `hook`, `memory`, `scope`, `ci`, `electron`, `auth`, `release`.

- Use `--tag TAG` in `search-facts.sh` to filter by tag.
- One fact can have multiple tags.
- Tags are stored in the fact file frontmatter only — not indexed in INDEX.md.
- Tags must not encode secrets or PII.

## Evidence Freshness (evidence_file / evidence_hash)

`source` and `evidence` are self-reported and never checked against anything —
a fact can cite `guard-destructive.sh:42` for years after that line moved or
the file changed shape, and nothing here would notice. `evidence_file` +
`evidence_hash` close that gap for the common case where a fact's evidence
really is "this one file, as it looked when I wrote this fact":

- Set both together, only when `evidence` names a real repo-relative file.
  `add-fact.sh` does this automatically — computes the SHA-256 at write time,
  no manual hashing.
- `bash core/scripts/verify-fact-freshness.sh` recomputes the hash of every
  fact's `evidence_file` and reports `FRESH` (hash still matches — the fact's
  cited file hasn't changed since), `STALE` (hash mismatch — the file the
  fact cites has changed; the fact needs re-verification, not automatic
  trust), or `SKIPPED` (no `evidence_file` set — most facts, especially
  decisions/constraints with no single-file evidence, and this is fine).
- This is advisory, matching `memory-provenance.sh`/`resolve-memory-conflict.sh`'s
  existing pattern: a manually-run report, not a hook that blocks a stale
  fact from being read. A `STALE` result is a prompt to re-verify and
  re-promote/demote `confidence`, not an automatic deprecation.

## Confidence Levels

| Level      | Meaning                                                      |
|------------|--------------------------------------------------------------|
| unverified | Default. Written from memory or inference, not confirmed.    |
| low        | Some indirect evidence exists but not authoritative.         |
| medium     | Confirmed once via direct observation (git, file, output).   |
| high       | Confirmed repeatedly, backed by persistent evidence.         |

Confidence is `unverified` by default. It MUST be promoted manually — never auto-promoted.

## Scope Values

| Value   | Meaning                                             |
|---------|-----------------------------------------------------|
| Yana AI  | Applies only to this yana-ai repo             |
| product | Applies only to the target product being built      |
| both    | Applies across both contexts                        |

Scope is mandatory. Without it, the fact cannot be safely applied.

## Hard Limits

- No network calls, no external services
- No secrets, tokens, API keys, credentials, or passwords
- `confidence: unverified` is the default — promote only after manual verification
- `scope` is required — a fact without scope cannot be safely used

## Example Fact File

```markdown
---
id: fact-001
type: constraint
statement: Yana AI-scoped tasks must not touch app/ components/ lib/ db/ without explicit cross-scope approval.
source: user:2026-05-17
confidence: high
scope: both
expires_at: 2027-01-01
forbidden_assumptions:
  - Do not assume approval carries over between sessions
  - Do not assume Yana AI scope = product scope
evidence: gates/action_gate.md § Scope Rules
---

Cross-scope edits require an explicit "approved to cross scope into <path>" statement from the user
in the current session. The approval does not persist across sessions.
```

A fact whose evidence is one specific file (not a section reference like the
example above) gets `evidence_file`/`evidence_hash` too — set automatically
by `add-fact.sh`, never by hand:

```yaml
---
id: fact-002
type: observation
statement: token-budget-guard.sh's circuit-breaker deny path returns exit 2 with hookSpecificOutput JSON.
source: file:core/hooks/token-budget-guard.sh
confidence: high
scope: Yana AI
evidence: core/hooks/token-budget-guard.sh
evidence_file: core/hooks/token-budget-guard.sh
evidence_hash: 3f9a1c...   # SHA-256 at write time — verify-fact-freshness.sh re-checks this
---
```

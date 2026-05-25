---
description: Proactively verify a claim before stating it. Shows evidence inline and rates confidence. Distinct from Truth Gate (reactive) — /fact-check is proactive, invoked before you commit to a statement.
argument-hint: <claim or topic to verify>
---

You are running a fact-check on: `$ARGUMENTS`

Your job is to verify the claim with real evidence before stating it.
Do NOT say anything is "verified" without showing the evidence inline.

---

## Step 1 — Restate

Restate the claim in one sentence, in your own words.
If the claim is ambiguous, ask for clarification before proceeding.

## Step 2 — Gather Evidence

Check the actual sources. Acceptable evidence (in order of strength):

| Evidence type | How to get it |
|---|---|
| File content | Read the file, cite `file:line` |
| Git history | `git log --oneline`, `git show <hash>` |
| Test output | Run the test, show counts |
| Terminal output | Run the command, show stdout |
| Config / schema | Read the file, quote the relevant section |

Do not accept as evidence:
- Your own previous message
- TODO.md or MEMORY.md entries
- Comments in code that say "this is done"
- Checkpoint or task files with status fields

## Step 3 — Rate Confidence

Choose exactly one:

**verified** — evidence shown inline, directly supports the claim.
Cite the exact reference: `file:line`, commit hash, or command output.

**likely** — indirect evidence supports the claim but does not confirm it
directly. State what the gap is.

**unverified** — no sufficient evidence found.
List what would need to be true (or what command to run) to upgrade this
to `verified`.

## Step 4 — Output Format

```
CLAIM: <one-sentence restatement>

EVIDENCE:
  <show the actual output, file content, or git log inline>

CONFIDENCE: verified | likely | unverified

REFERENCE: <file:line, commit hash, or "none found">

UPGRADE PATH (if unverified/likely):
  - <what would confirm this>
  - <what command to run>
```

---

## Hard Rules

- Never rate `verified` without evidence shown in this response.
- Never skip Step 2 — always look before rating.
- If evidence contradicts the claim, say so explicitly; do not look for
  alternative evidence to support the original claim.
- This command is proactive; Truth Gate (`gates/truth_gate.md`) is
  reactive. Use `/fact-check` before making a claim, not as a workaround
  after Truth Gate warns.

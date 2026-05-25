# YAMTAM Blackbox OS

**Version:** concept-draft-2026-05-25  
**Status:** Directional — not yet implemented  
**Roadmap target:** v1.9.0+

---

## One-Line Positioning

YAMTAM ENGINE is not an IDE, not a terminal, and not just an agent pack.  
It is a **blackbox and constitution runtime for AI coding agents**: recording what agents do, verifying what they claim, blocking unsafe actions, and turning past failures into future protection.

---

## The Problem

IDEs execute keystrokes. Terminals execute commands. Neither records why an AI agent made a decision, whether its success claim is true, or what it would have done differently.

When an AI coding agent fails, the typical post-mortem is:
- Scroll back through conversation history (loses context after compaction)
- Re-read edited files (doesn't show what was considered and rejected)
- Run tests again (doesn't explain the original intent)

**Five questions that currently have no good answer:**

1. What did the agent intend to do, step by step?
2. Which commands were run and in what order?
3. Which files changed, and was the diff reviewed before claiming success?
4. What evidence supported the agent's "done" claim?
5. Could this failure have been predicted and blocked?

Git answers "what changed." Logs answer "what ran." Neither answers "what the agent was thinking, what it verified, and whether its claim was honest."

YAMTAM Blackbox OS closes that gap.

---

## Core Modules

### 1. Agent Flight Recorder

**Purpose:** Capture a complete, replayable timeline of every agent session.

**Not the same as logs.** Logs record system events. The Flight Recorder records agent reasoning: intent → plan → action → evidence → claim, in one structured file per session.

**Input:** Every tool call, file write, bash command, risk score, claim, and evidence artifact from the session.

**Output:**
```
.yamtam/blackbox/session-2026-05-25T14-32-01.jsonl   ← machine-readable
.yamtam/blackbox/session-2026-05-25T14-32-01.md      ← human-readable timeline
```

**Example session timeline (human-readable):**
```
14:32:01  USER REQUEST    "Update README to reflect v1.7.3"
14:32:02  AGENT PLAN      read README.md → find version refs → update → verify
14:32:03  TOOL CALL       Read(README.md)       risk=0  status=OK
14:32:05  TOOL CALL       Edit(README.md)       risk=15 status=OK  diff=+3/-2 lines
14:32:06  EVIDENCE        grep "1.7.3" README.md → 3 matches found
14:32:07  CLAIM           "README updated to v1.7.3"
14:32:07  VERDICT         PASS — evidence matches claim
```

**Example session timeline (failed case):**
```
14:45:01  USER REQUEST    "Run tests and confirm passing"
14:45:03  TOOL CALL       Bash("npm test")      risk=10 status=OK
14:45:08  CLAIM           "All tests passing"
14:45:08  VERDICT         WARN — claim not supported: output shows 2 skipped, 1 timeout
```

**Why different from IDE/terminal:** IDEs show what ran. The Flight Recorder shows what the agent claimed vs. what actually happened, with the gap flagged.

---

### 2. Constitution Runtime

**Purpose:** Enforce behavioral rules at runtime — not as documentation, but as executable gates that block actions before they happen.

**Not the same as rules/ folder.** Rules are markdown. Constitution Runtime is a check that fires before each consequential action and returns PASS or BLOCK.

**Input:** Agent intent (what it wants to do next) + session state.

**Output:** PASS (continue) or BLOCK (halt with reason).

**Core constitution checks:**

```
BLOCK if: agent claims DONE without running tests
BLOCK if: agent modifies release artifacts without verifying MANIFEST
BLOCK if: agent writes to core/rules/ without BFT quorum
BLOCK if: agent marks task complete without showing evidence
BLOCK if: agent claims file updated but diff is empty
WARN  if: agent is about to touch more than 5 files outside declared scope
WARN  if: session has run > 20 tool calls without a checkpoint
```

**Implementation pattern:**
```bash
# constitution-check.sh — called by PreToolUse hook
check_constitution() {
  local action="$1"
  local context="$2"
  
  # Claim gate: no DONE without evidence
  if echo "$action" | grep -qi "done\|complete\|finished\|pass"; then
    [[ -z "$YAMTAM_SESSION_EVIDENCE" ]] && {
      echo "BLOCK: claim without evidence — run tests or show diff first"
      exit 6
    }
  fi
  
  # Scope gate
  local touched_files
  touched_files=$(git diff --name-only 2>/dev/null | wc -l)
  [[ "$touched_files" -gt 5 ]] && \
    [[ -z "$YAMTAM_SCOPE_DECLARED" ]] && {
      echo "WARN: scope drift — $touched_files files touched, scope not declared"
    }
}
```

**Why different from IDE/terminal:** IDEs don't stop an agent mid-stream for claiming success without evidence. Constitution Runtime does.

---

### 3. Evidence Graph

**Purpose:** Build a dependency graph between claims and the artifacts that support them. Make unsupported claims structurally impossible to accept.

**Not the same as test output.** Tests tell you pass/fail. The Evidence Graph tells you which claim depends on which evidence, so a stale evidence artifact (test run from 3 changes ago) is flagged as insufficient.

**Input:** Claims made during the session, linked to the evidence collected at the moment of claiming.

**Output:**
```
.yamtam/evidence/session-2026-05-25T14-32-01-graph.json
```

**Graph structure:**
```json
{
  "claims": [
    {
      "id": "c1",
      "text": "README updated to v1.7.3",
      "ts": "2026-05-25T14:32:07",
      "evidence": [
        { "type": "file_diff", "file": "README.md", "lines_changed": 3 },
        { "type": "grep_result", "pattern": "1.7.3", "matches": 3 }
      ],
      "verdict": "SUPPORTED"
    },
    {
      "id": "c2",
      "text": "All tests passing",
      "ts": "2026-05-25T14:45:08",
      "evidence": [
        { "type": "command_output", "cmd": "npm test", "exit_code": 0 }
      ],
      "verdict": "PARTIAL — 2 skipped, 1 timeout in output"
    }
  ]
}
```

**Verdict levels:**
- `SUPPORTED` — evidence collected ≤60s before claim, matches claim scope
- `PARTIAL` — evidence exists but output contradicts claim
- `STALE` — evidence collected >5 minutes before claim
- `MISSING` — no evidence found for claim
- `FABRICATED` — claim explicitly contradicted by evidence

**Why different from IDE/terminal:** IDEs don't correlate what an agent said with what it actually verified. The Evidence Graph makes that correlation explicit and persistent.

---

### 4. Agent Autopsy

**Purpose:** When an agent session fails, automatically produce a structured post-mortem that identifies the failure point, the missing gate, and the rule that would have prevented it.

**Not the same as error logs.** Error logs show what crashed. Autopsy shows why the agent's behavior led to the crash — and what rule, gate, or evidence check would have blocked it upstream.

**Input:** Failed session's Flight Recorder log + Constitution violations + Evidence Graph.

**Output:**
```
.yamtam/autopsy/2026-05-25-readme-drift.md
core/rules/generated/no-claim-without-manifest-check.md    ← new rule
core/tests/regression/test-readme-version-matches-manifest.sh ← new test
```

**Autopsy report structure:**
```markdown
# Agent Autopsy: README drift — 2026-05-25

## What failed
Agent updated README.md to reference v1.7.3 but MANIFEST.json still showed v1.7.2.
Agent claimed "docs updated" without verifying version consistency.

## Root cause
No constitution check enforced cross-file version consistency before claiming docs complete.

## Failure chain
1. Edit(README.md) → success
2. Claim("docs updated") → PASS (incorrectly)
3. MANIFEST.json → not checked
4. Result: version mismatch shipped to release

## Missing gate
Constitution should check: if README version updated → verify MANIFEST.json matches.

## Generated rule
→ core/rules/generated/no-claim-without-manifest-check.md

## Generated regression test
→ core/tests/regression/test-readme-version-matches-manifest.sh

## Trust score impact
Session trust score: 72 → 65 (claim without cross-check)
```

**Why different from IDE/terminal:** IDEs don't generate new rules from failures. Autopsy does. Each failure makes the system harder to fail the same way again.

---

### 5. Project Immune System

**Purpose:** Accumulate protection over time. Each autopsy generates a new rule and test. The rule enters the Constitution Runtime. The test enters the regression suite. The failure becomes immunity.

**The feedback loop:**
```
failure → autopsy → new rule → new gate → new test
                                    ↓
                            next agent blocked
                            before same failure
```

**Immune memory structure:**
```
.yamtam/immune/
  acquired/        ← rules generated from real failures (timestamped)
  pending/         ← rules proposed but not yet verified
  retired/         ← rules superseded by stronger versions
  index.md         ← human-readable immunity log
```

**Immune index example:**
```markdown
# Immunity Log

| Date | Failure | Rule generated | Tests added | Status |
|------|---------|----------------|-------------|--------|
| 2026-05-20 | Agent claimed PASS without test run | no-claim-without-test-evidence | 1 | active |
| 2026-05-22 | Scope drift: 12 files touched, 3 declared | scope-drift-law-64 | 2 | active |
| 2026-05-25 | README/MANIFEST version mismatch | no-claim-without-manifest-check | 1 | pending |
```

**Promotion path for generated rules:**
1. Generated by autopsy → saved to `.yamtam/immune/pending/`
2. Human reviews + approves → promoted to `core/rules/generated/`
3. Constitution Runtime picks it up on next session start
4. Test added to regression suite

**Why different from IDE/terminal:** An IDE doesn't remember that your agent failed a specific way three weeks ago. The Immune System does, and it blocks the same mistake before it happens again.

---

## Folder Proposal

Two layers: engine-level (part of YAMTAM core, shared across repos) and project-level (per-repo, session-specific data).

### Engine-level additions (in `yamtam-engine/`)
```
core/
  constitution/
    checks/          ← individual constitution check scripts
    constitution-check.sh
  immune/
    acquired/        ← rules generated from failures
    pending/
    retired/
    index.md
```

### Project-level (in each repo using YAMTAM, gitignored by default)
```
.yamtam/
  blackbox/          ← session flight recorder logs
    session-*.jsonl
    session-*.md
  evidence/          ← evidence graphs per session
    session-*-graph.json
  autopsy/           ← autopsy reports
    YYYY-MM-DD-*.md
  constitution/      ← local constitution overrides
    local-checks/
  state/             ← existing audit-chain.log, circuit-state.json
```

`.yamtamignore` for large repos:
```
.yamtam/blackbox/
.yamtam/evidence/
```

`.gitignore` additions (auto-added by init):
```
.yamtam/blackbox/
.yamtam/evidence/
```

Autopsy reports are committed: they are documentation, not noise.

---

## Example End-to-End Workflow

```
User: "Update CHANGELOG for v1.7.3 and tag release"

1. CONSTITUTION CHECK  scope declared? → no → warn, ask user to /scope-declare
2. SCOPE DECLARED      CHANGELOG.md, MANIFEST.json, README.md
3. FLIGHT RECORDER     session started → log: 2026-05-25T15:00:00

4. AGENT PLAN          read CHANGELOG → add v1.7.3 section → verify → claim
5. TOOL CALL           Read(CHANGELOG.md)   → logged
6. TOOL CALL           Edit(CHANGELOG.md)   → logged, diff captured
7. EVIDENCE COLLECTED  grep "1.7.3" CHANGELOG.md → 4 matches
8. CLAIM ATTEMPT       "CHANGELOG updated"
9. CONSTITUTION CHECK  evidence present? → yes, MANIFEST version matches? → checking
10. TOOL CALL          Read(MANIFEST.json)  → version: 1.7.3 → match confirmed
11. EVIDENCE GRAPH     c1: SUPPORTED (file diff + grep + manifest check)
12. CLAIM ACCEPTED     CHANGELOG updated — SUPPORTED

13. AGENT continues → tag → constitution check → git tag requires human approval
14. HUMAN GATE         "git tag v1.7.3" → user approves
15. FLIGHT RECORDER    session ended → session-2026-05-25T15:00:00.md written
16. EVIDENCE GRAPH     written
17. IMMUNE CHECK       no failures this session → no autopsy generated
```

If step 9 had failed (MANIFEST still showed v1.7.2):
```
9b. CONSTITUTION CHECK  MANIFEST mismatch → BLOCK claim
9c. AUTOPSY TRIGGERED   failure logged
9d. RULE GENERATED      core/rules/generated/no-claim-without-manifest-check.md
9e. TEST GENERATED      test-changelog-matches-manifest.sh
9f. IMMUNE UPDATED      .yamtam/immune/pending/ ← new entry
```

---

## Public README Section

Add to YAMTAM ENGINE README under a new section "Blackbox OS":

---

### YAMTAM Blackbox OS: flight recorder for AI coding agents

Most AI coding tools execute actions and move on. YAMTAM records what happened, verifies what was claimed, and learns from what went wrong.

**Agent Flight Recorder** — Every session produces a replayable timeline: intent, plan, tool calls, evidence, claims, and verdicts. Not logs. A structured audit trail.

**Constitution Runtime** — Rules enforced at runtime, not just documented. Agents cannot claim success without evidence. Scope drift is flagged mid-session, not after the damage.

**Evidence Graph** — Claims are linked to the artifacts that support them. Stale evidence, missing evidence, and fabricated claims are caught before they leave the session.

**Agent Autopsy** — When a session fails, YAMTAM produces a structured post-mortem: what went wrong, which gate was missing, what rule and test would have blocked it.

**Project Immune System** — Each failure becomes a new rule. Each new rule enters the Constitution Runtime. Each session makes the next session harder to fail the same way.

---

## Roadmap

### Phase 1 — Blackbox session logs (v1.8.x)
- Flight Recorder hook (PostToolUse + Stop)
- Session JSONL writer
- Human-readable session MD formatter
- `.yamtam/blackbox/` directory creation on session start
- Basic claim detection (keyword-based)

### Phase 2 — Evidence Graph (v1.8.x)
- Evidence collector (file diff, grep result, test output, command exit code)
- Claim-evidence linker
- Verdict engine (SUPPORTED / PARTIAL / STALE / MISSING / FABRICATED)
- Evidence graph JSON writer

### Phase 3 — Constitution Runtime (v1.9.x)
- Constitution check script framework
- Core checks: claim-without-evidence, scope-drift, stale-evidence, manifest-mismatch
- Constitution gate as PreToolUse hook
- BLOCK/WARN output format

### Phase 4 — Agent Autopsy (v1.9.x)
- Failure detector (session-end with BLOCK or FABRICATED verdicts)
- Autopsy report generator
- Rule generator from failure pattern
- Regression test generator (shell-based)
- Pending immune rule workflow

### Phase 5 — Project Immune System (v2.0.x)
- Immune index tracker
- Human-review + promotion workflow for generated rules
- Immune rule integration into Constitution Runtime
- Safety score per session (0–100, based on claims/evidence ratio + constitution blocks)
- Public benchmark: sessions per failure, evidence coverage rate

---

## What This Is Not

- Not a static analysis tool (it observes runtime behavior, not source code structure)
- Not a test framework (it records evidence; existing test runners provide the evidence)
- Not another agent or skill pack (it is infrastructure that sits beneath all agents)
- Not a replacement for human review (autopsy-generated rules require human promotion)

---

## Naming

| Component | Internal name | Public name |
|-----------|--------------|-------------|
| Session recorder | blackbox-recorder | Flight Recorder |
| Rule enforcement | constitution-check.sh | Constitution Runtime |
| Claim verification | evidence-graph.json | Evidence Graph |
| Failure analysis | autopsy-report.md | Agent Autopsy |
| Rule accumulation | immune/acquired/ | Project Immune System |
| Full system | yamtam-blackbox-os | YAMTAM Blackbox OS |

---

*From Karpathy's framing: this is "Goal-Driven Execution" (verifiable success criteria) taken to its logical conclusion — not as a coding principle, but as enforced infrastructure.*

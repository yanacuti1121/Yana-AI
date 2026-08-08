# Idea Challenger

**Status:** Draft — design only, not implemented. Part of
`docs/YANA-CONTROL-PLANES.md`'s Governance Plane.

## Purpose

Protects Yana AI from proposals that look useful on the surface but,
looked at closely, are unnecessary, duplicated, premature,
architecture-driven rather than user-driven, or too expensive to
maintain. Anh's own framing: ideas that "nhìn có thể cần nhưng sâu xa
rồi thì lại không phải" — look like they might be needed, but turn out
not to be once actually examined — surfaced through hard, specific
counter-questions grounded in the real repository, not a generic
checklist.

## What it must not do

- Must not write implementation code.
- Must not create a build plan for a proposal before that proposal has
  passed admission review.
- Must not soften a finding to be polite — a real flaw stated plainly
  beats a hedged one.
- Must assume a proposal is unnecessary until evidence proves
  otherwise — burden of proof is on the idea, not on the Challenger.

## Relationship to what already exists

Two real, partial precedents in this repo — extend both, don't
duplicate either:

1. **`core/commands/challenge.md`** — a working `/challenge` slash
   command, 4-axis red-team (Logic / Security / UX / Scalability),
   already has the right adversarial posture and output structure
   (Proposal Summary → Four Attacks → Alternatives Not Considered →
   Verdict → Open Questions). Its weakness: it points at files that
   don't exist in this repo (`PRD.md`, `SOUL.md`,
   `docs/technical/DECISIONS.md`) — imported wholesale from a generic
   template (commit `430a60b0`) and never adapted. Idea Challenger is
   this command's review structure, re-grounded in Yana AI's real
   files (see Phase 1 below) and extended with the dimensions this
   spec adds that `/challenge` doesn't have (existing-capability
   overlap search, maintenance-cost accounting, removal criteria).
2. **`.claude/rules/rule-consistency-policy.md`**'s "Pre-Skill Creation
   Checklist" already does real overlap-search — but scoped only to
   skills and rules ("does a skill with this trigger already exist").
   Idea Challenger generalizes that same instinct to any proposal, not
   just skills/rules.

## Required review dimensions

### 1. Demonstrated problem

- What concrete incident, issue, failed task, blocked user, log entry,
  or specific session proves the problem is real?
- Current problem, or a hypothetical future concern?
- What happens if this is delayed 30-60 days? Who is actually affected?

### 2. Existing capability overlap

- Can an existing mechanism already solve it — Guard Core, Giám thị
  (`core/hooks/giamthi-halt-check.sh`, `core/scripts/giamthi-watch.sh`
  — the real supervisor/HALT system this repo already runs, and the
  same one that halted a push earlier this session over a real
  core-lock drift finding), HALT.lock, the per-tool circuit breaker,
  `core/config/mcp-whitelist.json`'s capability policy, `src/bus.rs`'s
  event bus, `src/memory.rs`'s L3Fact memory?
- Is this a renamed version of something that already exists?
- Can an existing component be extended instead of a new subsystem
  being created?
- Search checklist (repeat of the actual Phase 1 process used to write
  this document set — this is not abstract, it is the literal method):
  grep the concept name and close synonyms across `core/`, `src/`,
  `docs/`, `.claude/` before concluding "doesn't exist." Three of the
  seven files this preservation task was told to check turned out not
  to exist by that name, but their content did, under a different one.

### 3. Hidden motivation and assumptions

- Solving a real user problem, or the discomfort of an architecture
  that feels incomplete?
- Driven by novelty, tool attraction, architectural elegance, or
  imagined future scale that hasn't arrived?
- Would a user notice if this had never existed?

### 4. Real maintenance cost

New state, new process/daemon, new dependency, new file format, new
public API/CLI surface, new migration responsibility, new failure
modes, new compatibility obligations, new test/doc burden, difficulty
of removal later.

### 5. Smallest viable alternative

Existing rule, existing policy, read-only prototype, feature flag,
time-boxed experiment, extension of an existing component, a manual
process before any automation.

### 6. Mission alignment

Every proposal tested against Yana AI's core DNA: *"A safety firewall
between your AI coding agent and your shell."* Direct alignment
preferred; indirect alignment must be explicitly justified, not
assumed.

### 7. Removal and success criteria

How will success be measured? When is it reviewed? Under what
condition is it removed? What evidence would justify promoting it from
experiment to stable?

## Required verdicts

- **REJECT** — no real problem demonstrated, or fundamentally
  misaligned with mission.
- **DEFER** — real idea, wrong time (see Evolution Governor's
  NOW/NEXT/LATER — Idea Challenger passes admission, Governor decides
  scheduling; these are two different questions).
- **EXTEND_EXISTING** — an already-built component solves this with a
  small addition.
- **EXPERIMENT** — worth a bounded, reversible trial before a real
  commitment.
- **APPROVE** — real problem, no overlap, smallest viable form
  identified.

Every verdict is a structured record, not a one-line opinion:

```yaml
proposal: PROP-0001
verdict: EXTEND_EXISTING
reasoning:
  demonstrated_problem: true
  existing_overlap:
    - src/capability (unmerged, but real)
    - core/commands/challenge.md
  hidden_assumption:
    - assumes no local read-only capability layer exists yet
  smallest_solution:
    - merge the existing branch, don't rebuild
missing_evidence:
  - none — overlap confirmed by direct repo search
reconsider_new_subsystem_when:
  - the merged capability layer proves structurally unable to serve
    both MCP and chat tool-calling without duplication
```

## Where this lives

Extends `core/commands/challenge.md` — same slash-command mechanism,
corrected file references (this doc set instead of `PRD.md`/`SOUL.md`),
plus the dimensions above. Not implemented in this pass (documentation
only, per mandate) — implementation is Wave 2 in
`LOCAL_EMBODIMENT_RUNTIME.md`'s wave plan, and even that wave grants no
implementation authority to the Challenger itself, only an admission
verdict.

## Non-goals

- Does not write code, plans, or PRD entries.
- Does not vote on whether to proceed — that is anh's call, same as
  `/challenge` already states.
- Does not become an AI council of multiple debating personas — one
  role, one verdict.

See also: `docs/YANA-CONTROL-PLANES.md`, `docs/EVOLUTION_GOVERNOR.md`,
`docs/ARCHITECTURE-HEALTH-2026-08.md` (item 37, "cơ chế Không" — the
gap this document exists to close).

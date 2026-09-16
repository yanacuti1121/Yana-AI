# Yana Unified Engineering Architecture

Status: Phase 11 deliverable of the Yana/BMAD unification study. Depends on `BMAD-YANA-CAPABILITY-MATRIX.md` and `BMAD-YANA-GAP-ANALYSIS.md`. Design only. No production code changed by this document.

## 0. What this document is and is not

This describes the target shape of ONE Yana engineering system after absorbing the BMAD concepts identified as genuine gaps (capability matrix rows 13, 18, 19, 20, 22, 24, 30). It is not a rewrite proposal: the large majority of the system described here already exists as real code (Authority, Lease, guards, provider routing, mission dispatch, CI/release). The new material is concentrated in one place: a canonical pre-execution planning chain and a canonical WorkUnit that connects it to the execution machinery that already exists. Users of the resulting system should not be able to tell "this part came from BMAD" from "this part was always Yana" — there is one CLI (`yana-rt`), one state store per concern, one status vocabulary, one authority model.

## 1. Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PROBABILISTIC LAYER (LLM-mediated, proposes, never has final authority) │
│                                                                           │
│  Discovery agent   PRD agent   Architecture agent   Spec agent           │
│  (new, small)      (new)       (new + reuses          (extends existing │
│                                  lint_spine-style       spec-planner)    │
│                                  linter concept)                        │
│         │               │              │                    │           │
│         └───────────────┴──────────────┴────────────────────┘           │
│                              produces                                    │
│                                 ▼                                        │
│                        Planning Artifacts                                │
│                 (Discovery.md, PRD.md, ARCHITECTURE.md,                  │
│                  SPEC.json — one canonical schema, extends              │
│                  existing `yana-rt spec validate` shape)                 │
│                                 │                                        │
│                    mechanically linted (new, small,                     │
│                    BMAD lint_spine.py-inspired)                          │
│                                 │                                        │
│                                 ▼                                        │
│                   SPEC becomes input to →  WorkUnit creation             │
└─────────────────────────────────────────┬───────────────────────────────┘
                                           │
                    (this is the ONLY crossing point:
                     probabilistic output becomes a
                     deterministic-layer INPUT, never
                     a deterministic-layer DECISION)
                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DETERMINISTIC LAYER (existing Yana kernel, unchanged in mechanism,      │
│  extended in wiring)                                                     │
│                                                                           │
│   WorkUnit store          IntentDeclaration → AuthorityDecision          │
│   (evolves mission::Task,  (src/runtime/authority.rs, EXISTING,          │
│    absorbs task.rs's        unchanged)                                   │
│    dependency typing)              │                                     │
│         │                          ▼                                     │
│         │                   Lease (src/capability/lease.rs, EXISTING)    │
│         │                          │                                     │
│         ▼                          ▼                                     │
│   Status state machine      Guard hooks (.claude/settings.json,          │
│   (NEW: rank-ordered,        EXISTING, ~22 PreToolUse + ~6 PostToolUse)  │
│    non-downgradable,                │                                    │
│    BMAD sprint_plan.py-style)       ▼                                    │
│         │                    Execution (agent dispatch via               │
│         │                     TaskBrief, EXISTING)                       │
│         ▼                          │                                     │
│   Evidence collection ◄────────────┘                                    │
│   (EXTENDS task.rs EvidenceSignals with real git-diff                    │
│    measurement, BMAD git_evidence.py-inspired, NEW small module)         │
│         │                                                                │
│         ▼                                                                │
│   Review gate (EXTENDS spec-verifier with BMAD 5-way verdict             │
│    taxonomy; iteration cap enforced by EXISTING                         │
│    per-tool-circuit-breaker.sh pattern, NOT self-reported)               │
│         │                                                                │
│         ▼                                                                │
│   Receipt (src/runtime/receipt.rs, EXISTING, unchanged) +                │
│   Audit log (audit-log.sh hash chain, EXISTING, unchanged)               │
│         │                                                                │
│         ▼                                                                │
│   Release (EXISTING 3-axis versioning, unchanged) →                     │
│   Observability (EXISTING CLI surface, unchanged)                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. Boundaries and ownership

| Component | Owner (who may write) | New or existing |
|---|---|---|
| Discovery/PRD/Architecture/Spec agents | Probabilistic layer only, output is a proposed artifact, never a decision | New (small persona additions, pattern-matched to existing `core/agents/*.md`) |
| Planning artifact mechanical linters | Deterministic, but scoped narrowly: syntax/completeness checks only, no semantic judgment | New, BMAD `lint_spine.py`-inspired |
| WorkUnit store | Main agent only, subagents remain read-only per existing `subagent-policy.md`, unchanged | Evolves existing `mission::Task` |
| Status state machine | Deterministic function, no direct field writes permitted from anywhere | New, BMAD `sprint_plan.py`-inspired |
| IntentDeclaration / AuthorityDecision / Lease | Deterministic, existing code, unchanged | Existing (`src/runtime/authority.rs`, `src/capability/lease.rs`) |
| Guard hooks | Deterministic, existing code, unchanged | Existing (`.claude/settings.json`, `core/hooks/*.sh`, `src/guard/*.rs`) |
| Evidence collection | Deterministic, existing `EvidenceSignals` extended with a new git-measurement submodule | Existing + new small extension |
| Review gate | Probabilistic verdict proposal (extended `spec-verifier`), deterministic iteration-cap enforcement (existing circuit-breaker pattern) | Existing + new taxonomy extension |
| Receipt / audit log | Deterministic, existing code, unchanged | Existing (`src/runtime/receipt.rs`, `audit-log.sh`) |
| Release / observability | Deterministic, existing code, unchanged | Existing |

## 3. Data flow

1. Human states intent (a sentence, an issue, a conversation) — no artifact yet.
2. If risk/complexity (existing `risk-scorer.sh`/`confidence-scorer.sh` output, newly wired to gate this decision, see §6) is above a threshold, Discovery agent runs, producing a Discovery artifact with citation/staleness checks applied (BMAD `bmad-deep-recon` concept). Below threshold: this step is skipped entirely (see Adaptive Ceremony, §7).
3. PRD agent (or, for trivial changes, this step is skipped and intent is used directly) produces a PRD artifact.
4. Architecture agent produces an Architecture artifact when the change is structural; the mechanical linter runs against it before any human/LLM semantic review is requested.
5. Spec agent produces a SPEC artifact conforming to the existing (extended) `yana-rt spec validate` schema. This step is **mandatory for every WorkUnit above trivial ceremony level**, because it is the only artifact that crosses into the deterministic layer.
6. `yana-rt spec validate` runs (existing mechanism, schema extended per capability matrix row 21). Failure blocks progression; this is the mechanical, cheap check, analogous to `lint_spine.py`.
7. A validated SPEC creates a WorkUnit (deterministic layer). The SPEC's `scope`/`commands`/`capabilities` fields populate an `IntentDeclaration` (existing type, `src/runtime/authority.rs:44-59`) — this is the crossing point named in non-negotiable rule 6: the LLM-authored SPEC *proposes* an authority contract, it does not *become* one.
8. Human or policy-configured auto-approval (see §6) turns the `IntentDeclaration` into an `AuthorityDecision::Allow` and issues a `Lease` (existing mechanism, unchanged).
9. Execution proceeds inside the Lease's boundary, through existing guard hooks, existing provider routing, existing mission/TaskBrief dispatch.
10. On completion, Evidence is collected: existing `EvidenceSignals` plus the new git-diff-measurement submodule (capability matrix row 13/Group D), never a bare "done" claim.
11. Review gate runs: extended `spec-verifier` produces a 5-way verdict (BMAD taxonomy), routed into one of 4 categories. If `patch` or `intent_gap`, loop back to the appropriate earlier stage (step 3, 4, or 9 depending on category), counted by the existing circuit-breaker mechanism, not by LLM self-report. On exceeding the cap, HALT and escalate to human (existing HALT mechanism).
12. On a clean verdict, a Receipt is written (existing `receipt.rs`), the audit log records the full chain (existing `audit-log.sh`), and the WorkUnit's status transitions to `READY` (guarded, non-downgradable).
13. Release proceeds through existing 3-axis versioning; Observability (existing CLI) becomes the read surface for the whole lifecycle after the fact.

## 4. Lifecycle / state machine

Mapping the study's proposed `IDEA -> DISCOVERY -> SPECIFIED -> APPROVED -> IMPLEMENTING -> VERIFYING -> REVIEW -> READY -> RELEASED -> OBSERVED` chain against what already exists:

| State | Deterministic? | Evidence required? | Human approval? | Backing mechanism |
|---|---|---|---|---|
| IDEA | n/a (pre-artifact) | no | no | none needed, this is just the human's stated intent |
| DISCOVERY | no (LLM content) + yes (citation/staleness check) | no | no | new Discovery agent + new lint (BMAD concept) |
| SPECIFIED | no (LLM content) + yes (schema validation) | no | no | extended `yana-rt spec validate` (existing, extended) |
| APPROVED | yes | n/a (approval IS the evidence) | **yes, always** | `IntentDeclaration` → `AuthorityDecision` → `Lease` (existing, unchanged) |
| IMPLEMENTING | yes (execution bounded by Lease) | incrementally, via guard/audit hooks | no (bounded by prior approval) | existing mission/TaskBrief dispatch + guards |
| VERIFYING | yes | **yes, mandatory** | no | extended Evidence collection (existing + new git-measurement) |
| REVIEW | verdict is LLM (proposed), iteration-cap is deterministic | yes, consumes VERIFYING's evidence | conditionally (on HALT-triggering iteration exhaustion) | extended `spec-verifier` (BMAD taxonomy) + existing circuit-breaker |
| READY | yes (gate: evidence collected AND no open HIGH review findings) | yes | no | new guarded transition function |
| RELEASED | yes | yes (release artifact) | per existing `git-push-enforcement.md`/`human-gate-policy.md` | existing release infra, unchanged |
| OBSERVED | partially (existing CLI reads real data) | n/a | no | existing Observability, unchanged |

Agents may not skip APPROVED, VERIFYING, or READY under any ceremony tier (see §7); DISCOVERY, PRD, and ARCHITECTURE stages may be skipped for trivial changes, never SPECIFIED-through-READY.

## 5. WorkUnit / domain model

**Decision, confirmed with the human (2026-09-16 session) after a correction mid-implementation:** WorkUnit evolves `src/mission/mod.rs::Task` in place. `src/task.rs::Task` is **not** merged, migrated, or touched at all. An earlier draft of this document treated `task.rs::Task` and `mission::Task` as two competing implementations of the same concept (Phase-10-style internal duplication). That was wrong: `task.rs` backs its own real, separately-invocable CLI subsystem (`yana-rt task create/list/done/status/drop/depend`, `yana-rt eval run/judge/schema`) built around a working eval-judge quality circuit breaker (`eval_judge_attempts`/`eval_judge_breaker_until` fields, consumed by `skill_quality.rs` and `chat/mod.rs`, both with real, deliberate coupling to `task.rs` specifically). Merging it into `mission::Task` would mean deprecating a live command surface and a live safety mechanism, not renaming a struct. `task.rs`/`yana-rt task`+`eval` is a personal task tracker with a quality-loop; `mission::Task` is multi-agent dispatch orchestration. They solve different problems and both stay exactly as they are.

Proposed shape (illustrative, not final Rust — the implementation plan's Phase 2 owns the exact struct definition):

```
WorkUnit
├── id                          (existing, from mission::Task)
├── intent                      (NEW — human's original stated intent, freeform)
├── planning_artifacts          (NEW — references to Discovery/PRD/Architecture/Spec files, not inline content)
├── spec_ref                    (NEW — the validated SPEC that produced this WorkUnit's authority contract)
├── dependencies                (ABSORBED from task.rs::Task — typed edges: Blocks/Related/ParentChild/DiscoveredFrom)
├── owns / consumes / produces  (EXISTING, from mission::Task — resource scope)
├── agent                       (EXISTING, from mission::Task)
├── pass_criteria                (EXISTING, from mission::Task)
├── status                      (EXISTING enum, but transitions now guarded — see §4/§6, rank-ordered per BMAD concept)
├── intent_declaration_ref      (NEW — link to the IntentDeclaration this WorkUnit produced, existing type)
├── lease_ref                   (NEW — link to the Lease this WorkUnit executes under, existing type)
├── evidence                    (EXTENDED — existing EvidenceSignals + new git-diff measurement submodule)
├── review_verdicts             (NEW — history of 5-way-taxonomy verdicts, BMAD-inspired)
├── receipt_refs                (NEW — links to existing receipt.rs entries, not duplicated data)
└── audit_ref                   (NEW — pointer into existing hash-chained audit log, not duplicated data)
```

This is deliberately reference-heavy rather than data-heavy: WorkUnit does not re-store what Authority/Lease/Receipt/Audit already own canonically. It is the connective structure the capability matrix's Group A-through-G decisions require, not a fifth source of truth.

## 6. Authority contract wiring (implemented; corrected here from an earlier, inaccurate draft)

**Correction, made during implementation, not assumed at design time:** an earlier draft of this section described `IntentDeclaration` as the thing that *produces* a `Lease` on approval, and assumed a `network.*` capability existed to map `SPEC.network.allow[]` onto. Reading `src/runtime/authority.rs`/`origin.rs` directly showed both were wrong. The real mechanism: `IntentDeclaration` is attached to a `TurnContext` (via `TurnContext::with_intent`) and consulted by `narrow_by_intent` *after* the existing four-term envelope (HALT / capability-registry availability / lease-or-human-approval / policy) has already produced an `Allow` for that turn — it narrows that Allow to `HumanApprovalRequired` for anything not in `declared_capabilities`/`declared_scope`, it does not itself grant a Lease or replace the lease-or-approval check. Leases are issued by the existing, separate `capability::lease` mechanism, unchanged by anything in this document. Separately, `src/capability/registry_data.rs`'s real capability list (`repo.tree`, `repo.read`, `repo.search`, `git.status`, `git.diff`, `host.summary`, `process.list`, `process.inspect`, `command.validate`, `command.execute`, `file.write`, `config.write`) has no `network.*` entry at all today, so `SPEC.network.allow[]` has nothing real to map onto yet.

**Implemented (`src/spec/mod.rs::to_intent_declaration`):** a pure function `(spec: &Value) -> (IntentDeclaration, SpecIntentReport)`. Only `SPEC.commands.allow[]` maps to a real capability, `command.execute` (the one capability whose invocation is already scoped by command text, per `authority.rs::command_text_for_lease`), with each allowed command string becoming a `declared_scope` entry. `SPEC.network.allow[]` and `SPEC.approval_required[]` have no honest automatic mapping today (no matching capability exists for the first; the second's category names, `dependency_change`/`database_migration`/`ci_workflow_change`, are not literal capability names anywhere in the registry) — rather than guess, the function counts them into a returned `SpecIntentReport{mapped_command_entries, unmapped_network_entries, unmapped_approval_required_entries}` so a caller can see exactly what was and was not translated, never a silent drop. `SPEC.limits.*` is not mapped by this function at all; it belongs to Lease issuance (a separate, not-yet-built integration, left for a later phase once the WorkUnit/Lease-issuance wiring itself is designed).

Nothing about `authority.rs`, `origin.rs`, or `lease.rs` changes. `to_intent_declaration` is pure translation with no authority of its own; the actual `AuthorityDecision` is still made entirely by the existing `RuntimeAuthority::authorize_tool`/`preflight_turn` machinery, and a caller still has to explicitly call `TurnContext::with_intent(declaration)` to attach the result to a turn, an explicit, visible step, not an automatic side effect of validating a spec.

## 7. Evidence model

**Corrected from an earlier draft of this document:** Yana already has three real evidence mechanisms, not one. `src/evidence/mod.rs` (`yana-rt evidence run`/`evidence verify`) has the runtime itself execute a command and HMAC-sign its output, keyed by a secret the model never sees, so a fabricated "tests passed" transcript cannot be forged into a valid receipt. `src/capability/evidence.rs::ToolEvidence` attaches real, freshly-observed file-touch metadata (path, size, hash, mtime) to capability calls. `task.rs::EvidenceSignals{tests_passed, tests_failed, build_ok, coverage_pct, manual_note}` is the weak, regex-parsed fallback, and only that third mechanism was in scope of the original BMAD-adoption reasoning.

The unified model keeps the first two mechanisms unchanged (they are stronger than anything BMAD has and address threats BMAD's approach does not), and adds one small, narrow, new module performing real `git diff --numstat` measurement (files changed, lines added/removed, commits since WorkUnit creation), following BMAD `git_evidence.py`'s two-pass merge-vs-direct-churn separation technique and its "measurement only, never judges" discipline. This fourth signal measures something none of the other three do: the shape and size of the actual code change, not the authenticity of a command's output or a file's metadata. The verdict remains the review gate's job (§8), consuming all four signals as inputs alongside existing test/build/CI results Yana already collects reliably, preferring the HMAC-signed evidence path (`evidence run`) wherever a WorkUnit's execution already invokes it, and treating the regex fallback as genuinely last-resort.

`receipt.rs`'s Authority Decision Receipts and the general hash-chained audit log remain explicitly separate from WorkUnit Evidence, per the existing code's own documented reasoning (`receipt.rs` already distinguishes itself from `capability::evidence::ToolEvidence`): Evidence answers "did the claimed work happen," Receipts answer "what did the authority layer decide and why," the audit log answers "what happened, in tamper-evident order." Three different questions, three different mechanisms, all already real except the Evidence strengthening described above; this document does not merge them.

## 8. Review gate

Extends `spec-verifier`'s existing goal-backward-check protocol with BMAD's 5-way verdict taxonomy (`high/medium/low/false/maybe-false`) and 4-way routing (`intent_gap/bad_spec/patch/defer`). The verdict itself remains probabilistic (an LLM's judgment about a finding's severity and category) — this is not something that can or should be made deterministic. What becomes deterministic, closing BMAD's own admitted gap, is the loop: a real counter in the existing circuit-breaker state store (the same file-locked mechanism `per-tool-circuit-breaker.sh`/`token-budget-guard.sh` already use), incremented by code on each loopback, checked against a hard cap before allowing another iteration, HALTing and escalating to the human on exceed via the existing HALT mechanism, not by trusting the LLM to edit its own counter.

## 9. Agent capabilities and provider routing

No change to `src/model/` or `src/chat/`. The unification's only touch point here is definitional: each new lifecycle stage (Discovery, PRD, Architecture, Spec, extended Review) is a *capability* fulfilled by an existing persona-plus-provider-routing pattern, exactly like every other Yana agent today. Routing considerations (capability, risk, context, cost, latency, authority) are the existing `model/catalog.rs`/`model/provider.rs`/`gateway.rs` responsibility, unchanged. BMAD contributes zero code here (it has no provider routing of its own); it contributes only the *naming* of the capability set the study's Phase 9 asked to verify.

## 10. Deterministic kernel

No changes. Listed here for completeness of "one coherent architecture": `src/guard/*.rs` + `.claude/settings.json` hook wiring, `src/runtime/authority.rs`, `src/capability/lease.rs`, `src/model/circuit_breaker.rs`, `src/guard/token_budget.rs`, `per-tool-circuit-breaker.sh`, `audit-log.sh`, `receipt.rs`. The unification's only interaction with this group is additive wiring (§6, §8) and one new guarded status-transition function (§4/§5) that must itself call into existing state-writing discipline (file locks, atomic write, matching the pattern already proven in `mission/mod.rs`'s fixed race bug and BMAD `sprint_plan.py`'s reread-verify-rollback), not a new locking mechanism.

## 11. Storage

| Data | Store | New or existing |
|---|---|---|
| WorkUnit (evolved from mission::Task) | `.yana-ai/missions/<id>.json` (existing path, evolved schema) | Existing store, evolved schema |
| Planning artifacts (Discovery/PRD/Architecture/Spec content) | New directory, e.g. `.yana-ai/planning/<workunit-id>/*.md` + `spec.json` | New |
| IntentDeclaration / AuthorityDecision / Lease | Existing capability/lease state store, unchanged | Existing |
| Evidence (extended) | WorkUnit record + new git-measurement submodule output, no new store | Existing + extension |
| Receipts | `.yana-ai/authority-receipts.jsonl` (existing) | Existing |
| Audit log | `.claude/state/audit-chain.log` (existing) | Existing |
| `.yana-ai/tasks.json` (legacy `task.rs::Task`) | Migrated into WorkUnit store, then deprecated | Deprecated, see implementation plan |

No new database, no new state-management technology. This matches both repos' actual state-management reality: Yana uses locked JSON files, BMAD uses locked YAML/JSON files; neither has nor needs a database for this scale of state.

## 12. Migration path and compatibility impact

1. New WorkUnit fields are additive to the existing `mission::Task` schema; existing `.yana-ai/missions/*.json` files remain readable (default/optional new fields, matching the pattern this repo already uses elsewhere, e.g. `#[serde(default)]` on `Task`'s eval-judge fields per prior work documented in project memory).
2. `task.rs::Task` consumers (evidence-signal parsing, `.yana-ai/tasks.json` readers, the `eval judge` circuit breaker) are migrated in a separate, explicit phase with a real read/write compatibility shim, not a flag-day cutover; see implementation plan Phase 2 and its rollback strategy.
3. Guarded status-transition function is introduced alongside existing direct field writes initially (both paths work), then existing call sites are migrated one at a time to the guarded path, then direct writes are removed; this mirrors how this repo has previously handled hook-wiring migrations (e.g. the documented `token-budget-guard.sh` native-Rust-port migration keeping "same state files, no jq/Node spawn").
4. SPEC schema extension (§6) is additive to the existing `yana-rt spec validate` shape; existing valid specs remain valid.
5. No BMAD code, BMAD file formats, or BMAD runtime dependency (Python, `uv`, Jinja2, TOML) enters the Yana runtime at any point. Every adoption in this document is a from-scratch Rust or shell implementation of a *concept* BMAD demonstrated, sized to what Yana actually needs (tens to low-hundreds of lines each, not BMAD's ~6,900-line Python surface).

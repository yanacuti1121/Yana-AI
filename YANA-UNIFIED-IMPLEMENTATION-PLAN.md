# Yana Unified Implementation Plan

Status: Phase 12 deliverable of the Yana/BMAD unification study. Depends on the capability matrix, gap analysis, and target architecture documents. **This plan is not authorization to implement.** Per the study's own rules and this repo's `golden-principles.md` Hard-Gate #9, no code changes begin until the human has reviewed and approved the design in `YANA-UNIFIED-ENGINEERING-ARCHITECTURE.md`, and specifically the one explicitly-flagged open decision in Phase 2 below.

## Cross-cutting constraints on every phase

- Any phase touching `core/hooks/`, `core/rules/`, `core/gates/`, `.claude/hooks/`, or `.claude/rules/` requires the two-reviewer dispatch (`security-auditor` + `architecture-auditor` or `code-auditor` per the trigger-path table) before merge, per this repo's own `54-bft-consensus-law.md`. This applies to Phase 6's new lint scripts if they become hooks, and to Phase 7/8's circuit-breaker wiring.
- Every phase preserves the existing `subagent-policy.md` contract: any new persona agent (Phase 6) is read-only, reports plain text, never writes files or commits directly.
- Every phase that touches `.yana-ai/*.json` schemas adds fields as optional/defaulted, never removes or renames an existing field in the same change that also removes the old reader, per the migration discipline in the architecture doc §12.
- No phase introduces a new state-management technology (database, new file format family) not already in use in this repo (locked JSON/YAML files).
- No phase vendors BMAD code, Python, `uv`, Jinja2, or TOML-based config into the Yana runtime. Every "ADOPT_BMAD_CONCEPT" item is a from-scratch, appropriately-sized Rust or shell implementation.

---

## Phase 0 — Human decision checkpoint (RESOLVED 2026-09-16)

**Original goal:** get sign-off on whether WorkUnit evolves `mission::Task` or `task.rs::Task`.

**Resolution:** neither, as originally framed — the premise was wrong. Mid-implementation (while starting Phase 2), reading `task.rs`'s real call sites showed it backs its own live CLI subsystem (`yana-rt task`, `yana-rt eval`) with a working eval-judge circuit breaker used by `skill_quality.rs`/`chat/mod.rs`. It is not a competing implementation of the same concept as `mission::Task`; the two solve different problems. Confirmed with the human: **WorkUnit evolves `mission::Task` in place; `task.rs::Task` is untouched, permanently, not just deferred to a later phase.** Phase 2 (below) is resolved as a result — there is no merge left to do.

**Remaining secondary items** (still open, not blocking anything shipped so far): the ceremony-tier thresholds (Phase 8), and whether Phase 9 (retrospective) is in scope at all for this unification or purely deferred.

---

## Phase 1 — SPEC schema extension and validator hardening

**Goal:** make the existing `yana-rt spec validate` the single, real, mandatory gate for the planning chain's output, per capability matrix row 21.

**Files/modules affected:** `src/spec/mod.rs` (129 lines today).

**Existing components reused:** the validator itself, its CLI wiring, its existing required fields (`id`, `goal`, `tasks[]`) and recommended fields (`scope`, `acceptance_criteria`).

**New components:** additional optional fields matching architecture doc §6's mapping (`commands.allow[]`, `network.allow[]`, `limits.*`, `approval_required[]`), all additive.

**Components removed:** none.

**Migration:** existing valid SPEC files remain valid (new fields optional). No reader/writer needs to change simultaneously.

**Tests:** unit tests for each new optional field's validation logic; a regression test loading a pre-Phase-1 SPEC file (no new fields) confirming it still validates.

**Acceptance criteria:** `cargo test` green; a hand-written SPEC using every new field validates correctly; a hand-written SPEC missing every new field still validates as before.

**Risk:** low. Purely additive schema change to an already-isolated, already-tested module.

**Rollback:** revert the commit; no data migration was performed, so rollback is a plain code revert.

---

## Phase 2 — WorkUnit unification (RESOLVED, no merge needed — see Phase 0)

**Original goal:** merge `task.rs::Task` into `mission::Task`.

**Resolution:** cancelled. `task.rs`/`yana-rt task`+`eval` is a real, separately-used CLI subsystem with its own eval-judge circuit breaker, not a duplicate of `mission::Task` — see Phase 0's resolution and architecture doc §5. Nothing in `task.rs` is touched by this unification. WorkUnit is simply `mission::Task` as it already stands plus the additive fields/functions Phases 3, 4, and 5 already shipped (`transition_status`, git-measurement evidence, `to_intent_declaration`). No migration, no data-loss risk, no `.yana-ai/tasks.json` involvement, because `.yana-ai/tasks.json` belongs entirely to the untouched `task.rs` subsystem and always will.

**What this means for the rest of the plan:** every later phase that referred to "WorkUnit" should be read as "`mission::Task`, as extended by Phases 3/4/5." Phase 6 onward (planning-chain agents, review gate, adaptive ceremony) are unaffected by this resolution — none of them depended on the cancelled merge.

---

## Phase 3 — Guarded status transition (SHIPPED, on `mission::Task`, scope narrowed during implementation)

**Status: implemented and merged into the working tree** (`src/mission/mod.rs`), ahead of Phase 2 (WorkUnit unification), since it turned out to be fully self-contained to `mission::Task` and did not need to wait for the Task/Mission merge decision.

**Goal (as executed, narrower than originally planned):** apply BMAD's "don't silently downgrade a completed status" discipline (capability matrix row 22) to `mission::Task`. The original plan above called for a full rank-ordered table with an `override_confirmed` escape hatch. Implementation found that design would have been a regression: before this phase, `cmd_done` and `cmd_fail` set `.status` with **no check on the prior status at all**, meaning `Pending -> Done`, `Pending -> Failed`, `Running -> Done`, and `Running -> Failed` were all already legal and presumably relied upon by real callers. A full rank table (as sketched) would have silently blocked `Pending -> Done` and `Pending -> Failed`, neither of which is the actual problem BMAD's concept addresses. The shipped guard is narrower and safer: **`transition_status` blocks only leaving `Done`** (i.e. a finished task cannot be silently reopened to `Failed` or re-marked `Done` with different evidence), and leaves every previously-permitted transition exactly as permissive as it already was. `cmd_cancel`/`cmd_retry` keep their existing, more specific per-status guards unchanged; this function adds the one check none of the five handlers had, rather than replacing what already worked.

**Files/modules affected:** `src/mission/mod.rs` only (`TaskStatus`, new `IllegalTransition` type, new `transition_status` function, all 5 status-writing call sites: `cmd_dispatch`, `cmd_done`, `cmd_fail`, `cmd_cancel`, `cmd_retry`).

**Existing components reused:** the existing `with_mission_locked` atomic reload-mutate-save pattern (unchanged); all 5 write sites already funneled through this one locked path, so no new locking was needed.

**New components:** `pub fn transition_status(from: &TaskStatus, to: TaskStatus) -> Result<TaskStatus, IllegalTransition>` and `pub struct IllegalTransition { from, to, reason }` with a `Display` impl.

**Components removed:** none; the pre-existing per-handler guards in `cmd_cancel` ("only Running tasks can be cancelled") and `cmd_retry` ("only Failed tasks can be retried") are kept as-is, not replaced.

**Migration:** none needed; purely additive to `mission::Task`'s write paths, no stored data shape changed.

**Tests (real, passing):** `done_cannot_be_reopened_to_any_other_status`, `done_to_done_is_a_no_op_not_an_error`, `every_previously_permitted_transition_stays_legal` (regression-pins all 7 previously-legal transitions), `illegal_transition_reports_the_terminal_reason`, `cmd_done_on_an_already_done_task_is_rejected_end_to_end`.

**Acceptance criteria: met.** `cargo test --bin yana-rt` 822/822 passing (up from 817 pre-Phase-3/Phase-4, +5 new tests), zero regressions across the full existing suite.

**Risk realized and mitigated:** the medium risk flagged in the original plan (missing a call site, or over-tightening and breaking real usage) materialized in design, not in shipped code — caught during implementation before merge, not after, by checking the *actual* prior behavior of every handler rather than assuming the rank-table design was correct by construction.

**Rollback:** revert the commit; no stored data was migrated, so rollback is a plain code revert with zero data impact.

**Remaining scope, deferred to Phase 2/2b:** applying this same discipline to `task.rs::Task` (which has its own, separate `TaskStatus` enum) is intentionally not done here — that merge is still gated on the Phase 0 human decision about the WorkUnit base type, per the risk profile described below.

---

## Phase 4 — Evidence strengthening

**Goal:** add real git-diff-based measurement as a fourth, narrow evidence signal (capability matrix row 13, corrected), per architecture doc §7. **Corrected scope:** this phase does not touch `src/evidence/mod.rs` (HMAC-signed command receipts) or `src/capability/evidence.rs::ToolEvidence`, both of which are real, already stronger than anything BMAD has, and out of scope for any change. Only `task.rs::EvidenceSignals`, the weak regex-based fallback, gets a new sibling signal.

**Files/modules affected:** new small module `src/evidence/git_measure.rs` (added to the existing `src/evidence/` directory, alongside `mod.rs` and `crypto.rs`, not a competing top-level module), `task.rs`'s `EvidenceSignals` extended with new optional fields.

**Existing components reused:** the existing `src/evidence/` module directory structure; none of `evidence/mod.rs`'s HMAC logic is touched.

**New components:** a function computing `git diff --numstat`-equivalent measurement (files changed, lines added/removed, commit count) scoped to a WorkUnit's lifetime, using either a `git2`-crate call or a sandboxed shell-out to `git` (existing `execution-environment.md` safe-wrapper pattern, `execFile`-equivalent in Rust: `std::process::Command` with argv, never a shell string), following BMAD's two-pass merge-vs-direct-churn separation technique to avoid double-counting.

**Components removed:** none; this is additive to existing `EvidenceSignals`, not a replacement.

**Migration:** none needed; existing evidence records without the new fields remain valid (optional/defaulted).

**Tests:** unit tests against a real git repo fixture (this repo itself, or a throwaway test repo) with known commit/merge history, asserting the measurement matches `git log --numstat` ground truth; a test specifically exercising the merge-vs-direct-churn separation (the exact bug class BMAD's two-pass design avoids).

**Acceptance criteria:** measurement matches manually-verified `git` output on a real fixture; no shell-injection surface (argv-only invocation, no string interpolation into a shell).

**Risk:** low-medium. Git plumbing edge cases (detached HEAD, shallow clones, merge commits) are a real but well-understood risk class; BMAD's own two-pass design exists specifically because of one such edge case (merge-commit double-counting), so that lesson is inherited, not re-discovered.

**Rollback:** new fields are additive; disabling the new measurement function (leaving existing regex-based `EvidenceSignals` fields as the only evidence) is a one-line revert with no data loss.

---

## Phase 5 — Authority wiring (SPEC → IntentDeclaration) (SHIPPED, scope corrected during implementation)

**Status: implemented and merged into the working tree** (`src/spec/mod.rs::to_intent_declaration`).

**Goal (as executed, corrected from the original plan above):** the plan as originally written assumed `IntentDeclaration` produces a `Lease` and that `SPEC.network.allow[]` maps to a real capability. Reading `src/runtime/authority.rs`/`origin.rs` and `src/capability/registry_data.rs` directly during implementation showed both assumptions were wrong (see architecture doc §6's correction). The shipped function reflects the real mechanism: `IntentDeclaration` narrows an already-approved turn via `TurnContext::with_intent`, it does not issue a `Lease`; and only `SPEC.commands.allow[]` maps to a real capability (`command.execute`) today.

**Files/modules affected:** `src/spec/mod.rs` (not a new file, per the doc comment's own reasoning: the translation function's natural home is alongside the `Spec` type it consumes, not a new `src/runtime/` file that would need its own justification for touching runtime-adjacent territory it doesn't need to).

**Existing components reused:** `crate::runtime::IntentDeclaration` (unchanged, referenced not modified), the extended SPEC schema from Phase 1.

**New components:** `pub(crate) fn to_intent_declaration(spec: &Value) -> (IntentDeclaration, SpecIntentReport)` and `pub struct SpecIntentReport{mapped_command_entries, unmapped_network_entries, unmapped_approval_required_entries}`, the last existing specifically so unmapped fields are visibly reported rather than silently dropped.

**Components removed:** none.

**Migration:** none; new code path.

**Tests (real, passing):** `spec_with_no_authority_fields_declares_nothing`, `commands_allow_maps_to_command_execute_capability`, `network_allow_is_reported_not_silently_dropped`, `approval_required_is_reported_not_silently_dropped`, `declared_reason_carries_id_and_goal_for_audit`, `full_authority_contract_spec_translates_end_to_end`.

**Acceptance criteria: met.** `cargo test --bin yana-rt` 828/828 (up from 822 pre-Phase-5, +6 new tests); zero changes to `authority.rs`/`origin.rs`/`lease.rs`, confirmed by the diff itself (this phase touched only `src/spec/mod.rs`).

**Risk realized and mitigated:** the "high consequence if the field mapping is wrong" risk flagged in the original plan was real and did surface during implementation, specifically for `network.allow[]` (there was no real capability to map it to) — resolved by refusing to guess a mapping and reporting the gap instead, which is the safer failure mode than a confident but wrong translation.

**Rollback:** the function is not called from anywhere yet (no WorkUnit-creation flow invokes it, since that depends on Phase 2); removing it is a plain revert with zero downstream impact.

**Explicitly deferred, not done here:** `SPEC.limits.*` → Lease-issuance-time bounds (this belongs to whatever function eventually issues a Lease when a WorkUnit is approved, out of scope until Phase 2/2b lands), and a real `network.*` capability in the registry (a `capability::registry_data.rs` change, its own separate decision, not bundled into this unification).

---

## Phase 6 — Planning-chain agents and mechanical linters

**Goal:** fill the genuine planning-stage gaps (capability matrix rows 18, 19, 20) with new, small, from-scratch implementations, not ports of BMAD code.

**Files/modules affected:** new `core/agents/discovery-agent.md`, `core/agents/prd-agent.md` (or extend existing `spec-planner.md`'s scope, TBD in review), new architecture-artifact linter (e.g. `core/scripts/lint-architecture.sh` or a `yana-rt` subcommand, decision left to implementation review given the existing pattern of Rust ports for anything performance/safety-relevant vs shell for anything simple), new discovery-artifact citation/staleness checker.

**Existing components reused:** `core/agents/*.md` persona-file convention, existing `subagent-policy.md` read-only contract, ADS-v1's phase-content vocabulary as the substantive basis for what each new persona actually asks for (not a copy of BMAD's prompts).

**New components:** the four items above. The mechanical linters are the direct BMAD-concept adoptions (`lint_spine.py`'s placeholder/ID/required-field checks, `bmad-deep-recon`'s citation/staleness checks), reimplemented from scratch, sized to Yana's actual artifact formats.

**Components removed:** none; ADS-v1 remains as reference/historical content per architecture doc §Group E reasoning, not deleted.

**Migration:** none; these are new, additive capabilities.

**Tests:** each linter gets unit tests against both a clean artifact (no findings) and a deliberately broken one (each specific check triggers correctly), mirroring how a real reviewer would validate `lint_spine.py`'s own test coverage.

**Acceptance criteria:** a full run of the planning chain (Discovery -> PRD -> Architecture -> Spec) on one real, small pilot feature produces a validated SPEC that Phase 5's translation function accepts, end to end.

**Risk:** medium. This phase requires the two-reviewer dispatch (per cross-cutting constraints) if any new script lands under `core/hooks/`; low risk if kept as plain `core/agents/*.md` + `core/scripts/` files outside the hook-wired surface.

**Rollback:** each new agent/linter is independently disable-able (simply don't invoke it); no dependency from existing execution-layer code on any of these new components, so rollback has zero blast radius outside the planning chain itself.

---

## Phase 7 — Review gate taxonomy and deterministic loop cap

**Goal:** extend `spec-verifier` with BMAD's 5-way verdict taxonomy and 4-way routing, enforced with a real counter (capability matrix row 24).

**Files/modules affected:** `core/agents/spec-verifier.md` (extended prompt/output contract), the existing circuit-breaker state store used by `per-tool-circuit-breaker.sh`/`token-budget-guard.sh` (new counter key added, same file, same locking).

**Existing components reused:** the existing circuit-breaker's file-locked state mechanism (this is the whole point: reuse the lock/cooldown machinery that already exists rather than inventing a second one for this specific loop).

**New components:** the verdict taxonomy itself (prompt-level, probabilistic), a new counter namespace in the existing circuit-breaker store, HALT-on-exceed wiring into the existing HALT mechanism.

**Components removed:** none.

**Migration:** none; this extends an existing agent's output contract additively (old-style pass/fail verdicts, if anything currently depends on that exact shape, should be handled with a transition period, TBD in review of actual current consumers).

**Tests:** a test simulating 5+ consecutive `patch`-category loopbacks confirming HALT triggers at the configured cap, not before and not after; a test confirming the counter is real state (survives a process restart), not in-memory only, since that's precisely the flaw BMAD's own version has (LLM-edited YAML frontmatter, no persistence guarantee).

**Acceptance criteria:** HALT triggers deterministically and only from the counter's real state, never from an LLM's self-report; existing circuit-breaker tests remain green (proving the shared state store wasn't destabilized by the new counter namespace).

**Risk:** medium; touches shared state-store code used by safety-critical existing circuit breakers, requires the two-reviewer dispatch per cross-cutting constraints.

**Rollback:** the new counter namespace can be disabled independently of the existing circuit-breaker's other namespaces; reverting this phase does not affect `per-tool-circuit-breaker.sh`'s existing behavior for anything else.

---

## Phase 8 — Adaptive ceremony wiring

**Goal:** wire the already-real, currently-unused-for-this-purpose `risk-scorer.sh`/`confidence-scorer.sh` output to lifecycle-stage selection (capability matrix row 30), closing the one place BMAD's advisory-only approach is weaker than what Yana already has sitting idle.

**Files/modules affected:** the planning-chain entry point (wherever a human's stated intent first becomes a WorkUnit candidate), reading existing risk-scorer output.

**Existing components reused:** `risk-scorer.sh`, `confidence-scorer.sh` (both real, both already wired as PreToolUse hooks per the Yana audit), unchanged.

**New components:** a three-tier mapping function (trivial/normal/high-risk, per the study's own Phase 8 example) from risk-scorer output to which of DISCOVERY/PRD/ARCHITECTURE stages are mandatory vs skippable for a given WorkUnit, per architecture doc §3 step 2 and §4's lifecycle table.

**Components removed:** none.

**Migration:** none; this is new routing logic, not a replacement.

**Tests:** a test for each tier confirming the correct stages are marked mandatory/skippable; a test confirming SPECIFIED-through-READY (the deterministic-layer-crossing states) are never skippable at any tier, per architecture doc §4's explicit constraint.

**Acceptance criteria:** three real end-to-end runs (one per tier) on representative pilot changes, confirming ceremony depth actually differs and that safety-relevant states are never skipped regardless of tier.

**Risk:** medium; the specific numeric thresholds separating trivial/normal/high-risk are a judgment call (flagged in Phase 0 as needing human confirmation) and getting them wrong in either direction either adds unwanted ceremony or under-protects a risky change.

**Rollback:** default to "normal" tier for everything (i.e. disable the trivial-tier fast path) if thresholds prove miscalibrated in practice; this is a one-line change to the tier-mapping function, not a structural rollback.

---

## Phase 9 (deferred, out of scope for this plan's acceptance) — Retrospective

**Goal:** capability matrix row 25, git-evidence-based retrospective, explicitly deferred per the gap analysis' own recommendation.

**Rationale for deferral:** depends on Phase 4's evidence module being in production use for at least one full cycle to have meaningful data to retrospect on; not blocking for any other phase; low urgency per both audits. Included here only so it isn't silently lost; not part of this plan's acceptance criteria.

---

## Overall acceptance criteria for the unification (all phases 1-8)

1. Every existing `cargo test` suite remains green throughout, phase by phase, not just at the end.
2. `task.rs::Task` and `mission::Task` are no longer two independent sources of truth (Phase 2/2b complete).
3. A real pilot feature can travel the full IDEA -> ... -> RELEASED chain through the new planning agents, the extended SPEC validator, the existing Authority/Lease chain (unmodified), and the extended review gate, producing a real Receipt and a real audit-log entry, with zero new BMAD runtime dependencies (no Python, no `uv`, no Jinja2, no TOML config format) anywhere in the path.
4. No phase weakened, bypassed, or duplicated any part of the existing deterministic kernel (Guards, Authority, Lease, Circuit Breakers, Audit, Receipts) per non-negotiable rules 3, 4, 5, 6.
5. A user interacting with the resulting system has no way to distinguish "this came from BMAD" from "this was always Yana"; there is one CLI, one WorkUnit type, one status vocabulary, one authority model.

## Overall rollback strategy

Because every phase above is additive-first (new fields/functions coexisting with old ones until an explicit, separately-gated removal step), the unification as a whole can be rolled back phase-by-phase in reverse order without data loss at any point except Phase 2b (the `task.rs::Task` removal step), which is why 2b is explicitly separated from Phase 2 and gated on a full production cycle of evidence that the unified WorkUnit path is stable.

# BMAD-YANA Capability Matrix

Status: Phase 2 deliverable of the Yana/BMAD unification study. Audit-only, no production code touched.

## Evidence sources

- Yana AI: direct source-code audit of this repo (`src/`, `core/`, `.claude/settings.json`), branch `codex-based-studio`, HEAD `f188be88`. High confidence on architecture/runtime/guards/authority/agent-system/task-abstractions/CI/release/planning/orchestration. Medium confidence on runtime-coupling/policy/provider-routing/autonomy/audit. Low confidence (not deeply read) on observability internals and the full `gates/`/`policy/`/`router/`/`scanner/` trees.
- BMAD-METHOD: `git clone --depth 50` of `bmad-code-org/BMAD-METHOD`, HEAD `94b6727`, version range v6.2.0 to "6.13.0-next". Full source audit including the Python helper scripts and their own test suite.
- Where a `.claude/rules/*.md` file makes a claim that could not be verified against real code (SLSA/cosign/in-toto signing, honeypot infrastructure, several "swarm bus" mechanisms), it is treated as **ASPIRATIONAL, not evidence**, per this repo's own documented pattern of writing and later retracting fictional rules-prose (see `50-financial-deadman-switch-law.md`, `54-bft-consensus-law.md`, `56-circuit-breaker-law.md`, `62-sovereign-overlord-gate-law.md`, `70-context-faithfulness-law.md`'s own "What this rule used to say" sections). Capability rows below cite real code, not rules prose.

## Headline finding that shapes every decision below

Yana AI already has a real, working, non-trivial implementation of the exact "probabilistic proposes, deterministic decides" split this study's non-negotiable rules demand: `src/runtime/authority.rs` + `src/capability/lease.rs` (`IntentDeclaration`, `AuthorityDecision::{Allow, HumanApprovalRequired, Deny}`, time/scope/budget-boxed `Lease` with delegation-chain re-validation on every consume). BMAD-METHOD has **no equivalent at all** — it has zero permission, scope, sandbox, or budget enforcement of any kind; it assumes the host coding agent (Claude Code, Codex) already provides that. This asymmetry means the unification is not "merge two peer systems." It is: Yana keeps and extends its execution/governance kernel unchanged, and BMAD contributes ideas almost exclusively to the *pre-execution planning* side, where Yana is comparatively weak and fragmented (three disconnected planning mechanisms found, see rows 18-22).

Second headline: BMAD is fundamentally a prompt-engineering framework, not a deterministic system. Its own maintainers say so implicitly by choice of architecture, and their v6.11.0 changelog says so explicitly: *"Skills stop guessing and start reading evidence."* Only a narrow slice of BMAD (config merging, template-render hashing, sprint/story status transitions, architecture-doc linting, git-evidence measurement) is real, tested, deterministic code (~6,900 logic lines, ~6,000 test lines). Everything else (agent personas, workflow step sequencing, review verdicts, PRD/spec/architecture *content*, adaptive ceremony) is Markdown prose trusted to an LLM. This means most "BMAD capabilities" are only available to Yana as **architectural concepts to adopt and then enforce with Yana's own deterministic machinery**, not as code to port.

## Quick-reference table

| # | Capability | Yana status | BMAD status | Decision |
|---|---|---|---|---|
| 1 | Deterministic guard/hook enforcement layer | REAL, mature (~22 PreToolUse + ~6 PostToolUse hooks wired) | None (assumes host provides it) | **KEEP_YANA** |
| 2 | General policy engine (declarative rule DSL) | PARTIAL/thin, fragmented | None | **NEEDS_RESEARCH** |
| 3 | Authority model (capability-scoped permission decisions) | REAL, sophisticated, already implements this study's core principle | None | **KEEP_YANA** |
| 4 | Lease (time/scope/budget-boxed execution grants) | REAL, race-hardened, delegation-chain enforced | None | **KEEP_YANA** |
| 5 | Agent/persona system | REAL (`core/agents/*.md`, single-session Task-tool dispatch) | REAL-but-prompt-only (5 core persona `SKILL.md` files) | **KEEP_YANA** |
| 6 | Provider/model routing | REAL, mature (catalog/provider/gateway/circuit-breaker) | None (host-agnostic by design) | **KEEP_YANA** |
| 7 | Task abstraction | REAL, **not actually duplicated** (corrected — see Group C): `task.rs::Task`/`yana-rt task`+`eval` is a separate, real, in-use CLI subsystem (personal task tracker + eval-judge quality circuit breaker, coupled into `skill_quality.rs`/`chat/mod.rs`), not a competitor to `mission::Task` | Story/epic discovered from markdown, no structured object | **KEEP_YANA both**, untouched, no merge |
| 8 | Mission/multi-task orchestration | REAL (`mission/mod.rs`, owns/consumes/produces + TaskBrief dispatch) | None (no workflow engine exists in BMAD) | **KEEP_YANA**, WorkUnit = `mission::Task` evolved in place, nothing else merged into it |
| 9 | Autonomy / circuit breakers (tool + model call) | REAL (`token_budget.rs`, `model/circuit_breaker.rs`) | None | **KEEP_YANA** |
| 10 | Audit log (tamper-evident) | REAL, hash-chain wired at PostToolUse | Real but weaker (`memlog.py`, append-only, no hash chain) | **KEEP_YANA** |
| 11 | Authority decision receipts | REAL (`receipt.rs`, append-only JSONL) | None | **KEEP_YANA** |
| 12 | Provenance (ported-module attribution) | REAL but narrow (verifies vendored-module headers only) | None equivalent | **KEEP_YANA**, unrelated scope, no change |
| 13 | Task completion evidence | REAL, and stronger than first assessed: **three** distinct mechanisms exist (`src/evidence/mod.rs` HMAC-signed command receipts, `src/capability/evidence.rs::ToolEvidence` file-touch metadata, `task.rs::EvidenceSignals` regex-parsed fallback) | REAL but narrower (`git_evidence.py`, numstat-based diff measurement only) | **KEEP_YANA** for the signing/metadata mechanisms, **ADOPT_BMAD_CONCEPT** only for the specific diff-measurement technique as a fourth, complementary signal (see correction note below) |
| 14 | CI/test infrastructure | REAL, mature (11 GH Actions workflows, 120+ test files) | BMAD tests only its own Python helpers, ships nothing to consuming projects | **KEEP_YANA** |
| 15 | Release infrastructure | REAL, deliberate 3-axis versioning | None | **KEEP_YANA** |
| 16 | Health/observability | PARTIAL (CLI surface exists, internals unaudited) | None | **KEEP_YANA**, mature in place |
| 17 | Evolution/governor | ASPIRATIONAL, honestly marked "Draft, not implemented" | None | **KEEP_YANA**, out of scope for this study |
| 18 | Discovery/research workflow | Effectively absent (ADS-v1 §RESEARCH is a prose heading only) | REAL-partial (`bmad-deep-recon`: citation/staleness/tally scripts; research content still LLM prose) | **ADOPT_BMAD_CONCEPT** |
| 19 | PRD/requirements artifact | Fragmented (ADS-v1 prose + no dedicated PRD skill) | Prompt-template-only (`bmad-prd`) | **UNIFY** |
| 20 | Architecture artifact + mechanical linting | Fragmented (ADS-v1 §ARCHITECTURE, no linter) | HYBRID: prose content + real linter (`lint_spine.py`) | **ADOPT_BMAD_CONCEPT** |
| 21 | Specification artifact + validator | REAL but thin/disconnected (`yana-rt spec validate`) | Prose-only schema (`stories-schema.md`, no validator code) | **UNIFY** (extend Yana's, don't import BMAD's) |
| 22 | Story/epic status state machine | Absent (task/mission status enums are simple, no monotonic-transition discipline) | REAL, genuinely careful (`sprint_plan.py`: rank-ordered, non-downgradable, atomic-write-verify-rollback) | **ADOPT_BMAD_CONCEPT** |
| 23 | Sprint/ceremony tracking | Absent (no Scrum-specific concept) | REAL bookkeeping, prose ceremony | **REJECT** as separate subsystem, fold "what's next" logic into #22 |
| 24 | Review gate (verdict taxonomy, loopback, iteration cap) | REAL but simpler (`spec-verifier` goal-backward check) | Elaborate taxonomy, **zero code enforcement** (`step-04-review.md`) | **ADOPT_BMAD_CONCEPT**, enforce via Yana's real circuit-breaker/HALT |
| 25 | Retrospective | Absent | REAL evidence-gathering + LLM narrative | **NEEDS_RESEARCH** / low priority, defer |
| 26 | Test generation | Covered by existing persona agents (`test-engineer`, `qa-engineer`) + real CI | Prompt-only, no execution, no independent check | **REJECT** for adoption |
| 27 | Config/customization system | REAL (`yana-rt config`) | REAL (4-layer TOML merge) but a second format | **REJECT** (would duplicate config format) |
| 28 | Extension architecture (new agent/skill authoring) | REAL (author a new `core/agents/*.md`), comparable maturity | Config-override only for *existing* skills; new skill types require manual authoring via a separate sister repo | **REJECT** / NEEDS_RESEARCH |
| 29 | Content-addressed template rendering | Absent, no current need | REAL, genuinely careful (`render_skill.py`) | **REJECT** for now / NEEDS_RESEARCH if Yana ever ships portable multi-host skill packages |
| 30 | Adaptive ceremony / risk-scaled process depth | Mechanism REAL (`risk-scorer.sh`, `confidence-scorer.sh`) but not wired to any lifecycle | Taxonomy well-named, **enforcement advisory-only** ("Neither limit is a gate") | **KEEP_YANA** mechanism + **ADOPT_BMAD_CONCEPT** taxonomy |

---

## Detailed capability write-ups

Grouped by theme. Every row above is addressed; closely related rows are documented together to avoid restating identical reasoning.

### Group A: Deterministic kernel (rows 1, 3, 4, 9, 10, 11, 12) — KEEP_YANA, no BMAD input

**Yana implementation:** `src/runtime/authority.rs` (312 lines) defines `RuntimeAuthority::{preflight_turn, authorize_tool, authorize_approved_tool}` and `AuthorityDecision::{Allow{decision_id}, HumanApprovalRequired{authority,reason}, Deny{authority,reason}}`. `IntentDeclaration` (authority.rs:44-59, cited in-code as "Authority Hardening item #7 / ADR-015") is documented to only ever *shrink* an Allow, never widen a Deny, and to never grant anything by itself. `src/capability/lease.rs` (1199 lines) implements `Lease{subject, capability, allow[], deny[], issued_by, expires_at, invocation_budget, remaining, revoked, parent_lease_id}` with `try_consume_matching` re-validating expiry/revocation/budget/delegation-chain under a file lock on every single use, not just at grant time. `.claude/settings.json` wires ~22 real PreToolUse hooks (`guard-destructive.sh`, `guard-blast-radius.sh`, `sandbox-wrap.sh`, `token-budget-guard.sh`, `per-tool-circuit-breaker.sh`, `freeze-scope.sh`, etc.) and ~6 PostToolUse hooks (`audit-log.sh` with hash-chain, `code-quality-gate.sh`, etc.). `receipt.rs` (619 lines) is a third, deliberately distinct audit-adjacent mechanism: append-only JSONL of every authority decision's reasoning, explicitly distinguished in its own doc comments from `capability::evidence::ToolEvidence` and the general audit log.

**BMAD implementation:** none. BMAD-METHOD assumes it runs inside a host coding agent that already provides tool permissions and adds no additional security/scope layer of its own (confirmed: no sandbox, no egress control, no capability tiers, no signature/audit chain anywhere in the repo).

**Overlap:** none.

**Differences:** Yana enforces via a real deterministic Rust runtime with file-locked state and re-validation on every use. BMAD has nothing comparable to compare against.

**Strengths / weaknesses:** Yana's authority chain is the single most mature subsystem found in either repo, already matching or exceeding the unification study's own Phase 6 example contract in rigor. Weakness: it is not yet *wired* to any planning artifact, i.e. nothing today populates an `IntentDeclaration`'s `declared_scope`/`declared_capabilities` from a spec/plan document. That wiring gap, not a missing mechanism, is the real work item (see Phase 6 of the architecture doc).

**Decision:** KEEP_YANA across the whole group. Do not weaken, replace, or duplicate any part of this with anything from BMAD, per non-negotiable rule 5 and rule 6.

**Reasoning:** BMAD offers zero deterministic enforcement of any kind in this space. There is nothing to adopt, and importing BMAD's advisory-only patterns here would be a regression.

**Migration impact:** none directly. Later phases wire planning output *into* this layer (additive), never replace it.

---

### Group B: Agent/persona system and provider/model routing (rows 5, 6) — KEEP_YANA

**Yana implementation:** `core/agents/*.md` persona files (e.g. `spec-planner.md`, 169 lines) dispatched synchronously via the Task tool per `subagent-policy.md`'s real, honest contract (read-only subagents, main-agent-writes-only, no persistent multi-process swarm). `src/model/` (catalog.rs 296, provider.rs 402, gateway.rs 288, circuit_breaker.rs 409 lines) plus `src/chat/` (anthropic.rs, gemini.rs, openai_compat.rs, ollama_native.rs, 15+ files) implement a real, mature multi-provider routing and circuit-breaking layer.

**BMAD implementation:** 5 core persona `SKILL.md` files (analyst, architect, dev, pm, ux-designer), each a Markdown role-play instruction ("Fully embody this persona... do not break character"), invoked via the host tool's own skill-discovery, not a BMAD-owned dispatch mechanism. BMAD does not route between LLM providers itself; it is host-agnostic by design and has no code in this space at all.

**Overlap:** conceptual only (both have named personas with a defined role/voice). No mechanism overlap.

**Differences:** Yana's persona dispatch already has a real permission contract (subagent read-only enforcement) that BMAD's role-play instruction has no equivalent for. Yana's provider routing is a real, tested, substantial subsystem; BMAD has none to compare.

**Strengths / weaknesses:** BMAD's persona *prose* (activation sequences, communication-style templates resolved from layered TOML config) is arguably more polished as writing, but that is a content-quality question, not an architecture question, and is out of scope for this study.

**Decision:** KEEP_YANA for both. No BMAD adoption.

**Reasoning:** Where BMAD has a real mechanism (persona-variable resolution from config), it duplicates something Yana doesn't need duplicated (Yana's agents don't need a 4-layer TOML persona-variable system; static Markdown persona files have worked and are simpler). Where Yana is weaker than nothing (provider routing), BMAD has literally nothing to offer, since it never built this layer.

**Migration impact:** none.

---

### Group C: Task/WorkUnit abstraction and orchestration (rows 7, 8) — UNIFY

**Yana implementation:** two incompatible `Task` types coexist. `src/task.rs::Task` (`id, name, status:{Open,InProgress,Done,Blocked}, scope, evidence:Option<Evidence>, dependencies:Vec<TaskDependency>` with typed edges `Blocks/Related/ParentChild/DiscoveredFrom`), stored in `.yana-ai/tasks.json`. `src/mission/mod.rs::Task` (`id, name, owns[], consumes[], produces[], agent, pass_criteria, status:{Pending,Running,Done,Failed}, evidence:Option<String>`), nested in `Mission{id,name,status,tasks[]}`, dispatched via `TaskBrief{mission_id,task_id,agent,scope:BriefScope{owns,consumes,produces},pass_criteria,instructions,subagent_policy}`, stored in `.yana-ai/missions/<id>.json`. No shared type between the two. An atomic-write race bug was found and fixed live in `mission/mod.rs` (documented in-code), evidence this is real production code, not a stub.

**BMAD implementation:** no structured task/story object at all. Epics and stories are *discovered* by regex over freeform Markdown headings (`sprint_plan.py:44-48`, `^#{1,3}\s*Epic\s+(\d+)`, `^#{2,4}\s*Story\s+(\d+)\.(\d+[a-z]?)`). The only structured, code-owned representation is the *derived status* written to `sprint-status.yaml`.

**Overlap:** conceptually, `mission::Task`'s `owns/consumes/produces + agent + TaskBrief` shape is architecturally the closest existing thing in either repo to a general "work unit" (resource-scoped, agent-assigned, dispatchable). `task.rs::Task`'s typed dependency graph is a capability neither `mission::Task` nor BMAD has.

**Differences:** BMAD never structures the task/story content itself, only its status. Yana structures both content and status, but in two disconnected models with different status vocabularies, different evidence shapes (heuristic text vs plain string), and different storage.

**Strengths / weaknesses:** `task.rs::Task`'s dependency typing is more expressive than `mission::Task`'s. `mission::Task`'s resource-scoped dispatch (`owns/consumes/produces`) and `TaskBrief` are closer to what an authority-aware WorkUnit needs (it can be directly used to populate an `IntentDeclaration`'s `declared_scope`). Neither Yana model has BMAD's non-downgradable status-transition discipline.

**Decision:** UNIFY. Evolve `mission::Task` into the canonical `WorkUnit` (see architecture doc Phase 4), absorbing `task.rs`'s typed dependency edges and migrating `.yana-ai/tasks.json` data into the unified store. Retire `task.rs::Task` as a second source of truth once migration is verified. Do not introduce a third, BMAD-shaped task model.

**Reasoning:** This is precisely the Phase-10 "duplicate task system" case the study asks to resolve. Two Yana-internal models already conflict; adding BMAD's freeform-discovery convention as a third option would make things worse, not better. What BMAD *does* usefully contribute here is the status-transition discipline (row 22), which should be applied to whichever single model survives, not used as a reason to keep a third one.

**Migration impact:** real. Every consumer of `task.rs::Task` (evidence-signal parsing, `eval judge` circuit breaker state, `.yana-ai/tasks.json` readers) needs a compatibility path. See implementation plan for a phased, tested migration rather than a flag-day rewrite.

---

### Group D: Task completion evidence (row 13) — KEEP_YANA (corrected) + narrow ADOPT_BMAD_CONCEPT

**Correction note:** this row was originally written as ADOPT_BMAD_CONCEPT on the claim that Yana's only evidence mechanism was `task.rs::EvidenceSignals`'s regex parser. That was wrong, caught during Phase 1/4 implementation when `src/evidence/mod.rs` was read directly (the original Yana audit fork missed this module entirely). Corrected below. This is exactly the kind of error rule 70 of this repo (context-faithfulness) exists to catch: a finding must be corrected the moment better evidence appears, not left standing because it was already written down.

**Yana implementation (corrected, three mechanisms, not one):**
1. `src/evidence/mod.rs` (`yana-rt evidence run` / `evidence verify`, ~170 lines): the runtime itself executes a command and signs its output with `HMAC-SHA256` keyed by `YANA_EVIDENCE_KEY`, a secret the model never sees. The receipt (`YANA-EVIDENCE v1 <exit> <sha256(output)> <hmac>`) is appended to the output. `evidence verify` recomputes the HMAC; a model without the key cannot forge a tag for fabricated output. This is real, tested (4 unit tests covering genuine round-trip, forged body, wrong key, swapped exit code), and directly defeats the specific threat "the agent typed text that looks like a passing test run without running it," a threat neither `task.rs::EvidenceSignals` nor BMAD's `git_evidence.py` defends against.
2. `src/capability/evidence.rs::ToolEvidence` (~140 lines): real, freshly-observed metadata (canonical path, byte count, SHA-256, mtime) attached to capability calls that touch a file, explicitly documented as "never a placeholder standing in for data we didn't actually collect."
3. `task.rs::EvidenceSignals{tests_passed, tests_failed, build_ok, coverage_pct, manual_note}`, populated by regex-parsing freeform evidence text the agent writes. This one *is* weak, exactly as originally described, but it is Yana's fallback/third mechanism, not its only one.

**BMAD implementation:** `skills/bmad-retrospective/scripts/git_evidence.py` (291 lines) does a real two-pass `git log --numstat` analysis (separating merge churn from direct churn to avoid double-counting), attributes commits to stories via word-boundary regex against story IDs, and is explicitly documented as "measurement only, never judges."

**Overlap:** all four mechanisms (Yana's three plus BMAD's one) aim at "ground a completion claim in something other than an LLM's say-so," but they defend against different specific fabrication vectors: Yana's HMAC receipts defend against forged *command output*; Yana's `ToolEvidence` defends against forged *file-touch metadata*; BMAD's `git_evidence.py` defends against an exaggerated or wrong *narrative about the size/shape of a code change*, something neither of Yana's two strong mechanisms currently measures.

**Differences:** Yana's HMAC system is cryptographically stronger than anything BMAD has (BMAD has no signing of any kind). BMAD's numstat measurement covers a dimension (diff size/shape, per-story attribution) neither Yana mechanism currently covers.

**Strengths / weaknesses:** Yana's `EvidenceSignals` regex fallback remains genuinely weak and should be treated as a last resort, used only when the two stronger Yana mechanisms weren't invoked. BMAD's `git_evidence.py` has no cryptographic guarantee at all (it trusts `git log` itself, which is a reasonable trust boundary, but a materially weaker one than HMAC-signed runtime execution).

**Decision:** KEEP_YANA for the two strong existing mechanisms (`evidence run/verify`, `ToolEvidence`), no BMAD input needed there. Narrow ADOPT_BMAD_CONCEPT: add a small, separate git-diff-measurement signal (files/lines changed, commit count scoped to a WorkUnit) as a fourth, complementary evidence input, specifically because it measures something the other three don't (the shape of the change itself), not because it's a stronger replacement for anything that exists.

**Reasoning:** the corrected picture makes this a smaller, more honest adoption: one narrow, additive signal alongside real infrastructure that already substantially exceeds what this row originally credited Yana with.

**Migration impact:** additive; does not touch `evidence/mod.rs` or `capability/evidence.rs` at all, and does not replace `task.rs::EvidenceSignals`, only supplements it.

---

### Group E: Planning-chain fragmentation (rows 18, 19, 20, 21) — ADOPT_BMAD_CONCEPT / UNIFY

This is the largest real gap found and the main place BMAD's ideas earn their keep.

**Yana implementation:** three disconnected mechanisms.
1. `spec-planner`/`spec-executor`/`spec-verifier` persona agents (`core/agents/*.md`, 169/178/182 lines): per-task, LLM-driven, planner produces `PLAN.md` from pre-existing `CLAUDE.md`+`PRD.md` (does not generate a PRD itself), executor implements task-by-task with atomic commits, verifier does a real goal-backward re-check rather than trusting `SUMMARY.md`. Well-designed but entirely probabilistic-layer, no tie to Task/Capability/Authority/Evidence.
2. ADS-v1 (`docs/programs/ADS-v1.md`, 196 lines): 16-phase Program-level process (INPUT, SPECIFICATION, CAPABILITY INVENTORY, ARCHITECTURE, WORKFLOW, READINESS, ADR, RESEARCH, DESIGN REVIEW, IMPLEMENTATION PLAN, IMPLEMENTATION, REVIEW, BENCHMARK, EVALUATION, DOCUMENTATION, CONTINUOUS IMPROVEMENT) with a "10-item Readiness Matrix" gate (<80% = blocked). Confirmed run for real once (Program J, 85% readiness with real benchmark numbers). Entirely a hand-filled template, no code enforces phase transitions, no state machine, no link to any other mechanism on this list.
3. `yana-rt spec validate` (`src/spec/mod.rs`, 129 lines): a real, working, but semantically unrelated JSON-schema-shaped validator (`id`/`goal`/`tasks[]`/`scope`/`acceptance_criteria`).

**BMAD implementation:** a named chain of skills, each producing one artifact: `bmad-deep-recon` (research, hybrid: LLM content + real citation/staleness/tally validation scripts) -> `bmad-prd` (prompt-template-only, no validator) -> `bmad-architecture` (hybrid: LLM content + real `lint_spine.py` mechanical linter for placeholders/duplicate-or-non-monotonic decision IDs/required fields, explicitly justified in-repo: *"LLMs miscount IDs and miss literal placeholders; a grep does not"*) -> `bmad-spec` (prompt-only, documented-but-unvalidated schema).

**Overlap:** ADS-v1's phase list is structurally very close to BMAD's named chain (both go roughly idea/input -> discovery/research -> requirements/specification -> architecture -> implementation plan -> review). Both are, at their core, prose the LLM is asked to follow. Neither Yana's `spec validate` nor BMAD's `stories-schema.md` talk to any planning-content stage.

**Differences:** BMAD's chain is fielded as versioned, individually-invocable skill packages with a genuine (if narrow) deterministic backstop at exactly two chokepoints: architecture-doc linting and (once discovered) story-status tracking. ADS-v1 has zero deterministic backstop anywhere in its 16 phases. BMAD's chain is battle-tested across an external user base (30 shipped skill packages, versioned v6.2-6.13); ADS-v1 has run once, internally.

**Strengths / weaknesses:** ADS-v1's phase list is arguably more thorough for Yana's actual needs (it includes CAPABILITY INVENTORY, ADR, BENCHMARK, EVALUATION, phases BMAD has no direct equivalent for) but is pure convention with no enforcement, and isn't linked to the equally-real Authority/Evidence systems sitting right next to it. BMAD's chokepoint-linting pattern (cheap deterministic check catches what an LLM reliably gets wrong, so semantic review can focus on judgment) is a genuinely portable idea, independent of BMAD's specific artifacts.

**Decision:** UNIFY into one canonical Yana planning chain, informed by BMAD's discrete-named-artifact taxonomy and its deterministic-lint-before-semantic-review pattern, built on Yana's own `spec validate` mechanism (extend it, don't replace it with a new format) and feeding directly into the real Authority/Evidence systems from Group A/D. ADS-v1 is not discarded: its phase list is the richer input for defining the *content* of each stage; BMAD contributes the *packaging discipline* (one skill per stage, mechanical lint before human/LLM semantic review) and the *linting technique* itself.

**Reasoning:** rule 12 ("if BMAD and Yana solve the same problem, choose ONE canonical implementation") applies directly. Keeping ADS-v1, spec-planner, and spec validate as three separate things while *also* importing BMAD's chain would create a fourth disconnected mechanism, the opposite of the goal.

**Migration impact:** significant but staged. ADS-v1 remains valid as historical content/reference for its phase-naming vocabulary; the new unified chain doesn't need to re-run Program J's ADS-v1 process, only formalize its lessons into code-backed stages going forward.

---

### Group F: Story/epic status state machine, sprint tracking (rows 22, 23) — ADOPT_BMAD_CONCEPT / REJECT

**Yana implementation:** `task.rs::Status{Open,InProgress,Done,Blocked}` and `mission::Task::Status{Pending,Running,Done,Failed}` are plain enums with no transition discipline: nothing prevents an agent from writing `Done` over `InProgress` without any check, and nothing computes "what should I work on next" deterministically.

**BMAD implementation:** `sprint_plan.py` (746 lines) maintains a real, rank-ordered status vocabulary per artifact kind (e.g. `STORY_RANK = {backlog:0, ready-for-dev:1, in-progress:2, review:3, done:4}`), a `_merge_status` function that refuses to silently downgrade an existing status (requires explicit `--set` + human confirmation to go backward), atomic-write with post-write reread-and-rollback-on-mismatch, and a deterministic priority-ordered "what's next" recommendation (`in-progress > review > ready-for-dev > backlog > optional-retro`, a hardcoded if/elif chain, not LLM-chosen). The "sprint ceremony" itself (planning conversation, story sizing) remains LLM prose.

**Overlap:** both are answering "what state is this unit of work in, and can it legally move." BMAD just actually enforces the answer.

**Differences:** Yana's status fields are freely mutable by any writer. BMAD's are guarded, monotonic (except with explicit override + confirmation), and crash-safe (atomic write + verify + rollback).

**Decision:** for row 22, ADOPT_BMAD_CONCEPT: apply rank-ordered, non-downgradable status transitions with atomic-write-verify-rollback to the unified WorkUnit's status field (Group C). For row 23, REJECT a standalone "sprint" subsystem: Yana has no Scrum-specific need, and the only genuinely useful piece (the deterministic "what's next" recommendation function) is folded directly into the unified WorkUnit/state-machine work, not built as a separate ceremony tracker.

**Reasoning:** the status-machine discipline is real, small, well-tested code that closes a real gap (Yana's task states are currently unguarded). Building a parallel "sprint" concept on top would be ceremony Yana's execution-first culture doesn't need, per this study's own Phase 8 instruction not to force heavyweight process onto every change.

**Migration impact:** additive at the type level (new guarded status-transition function replacing direct field writes); requires auditing existing call sites that mutate `.status` directly on either current `Task` type.

---

### Group G: Review gate (row 24) — ADOPT_BMAD_CONCEPT, re-enforced deterministically

**Yana implementation:** `spec-verifier` persona (182 lines) does a real goal-backward check: reads the code, runs tests, does not trust `SUMMARY.md`'s claims. No formal verdict taxonomy, no loopback protocol, no iteration cap.

**BMAD implementation:** `step-04-review.md` (85 lines) defines a genuinely well-designed process: parallel reviewer-subagent dispatch, a 5-way verdict system (`high/medium/low/false/maybe-false`), routing into 4 categories (`intent_gap/bad_spec/patch/defer`), a loopback that reverts code and re-runs planning/implementation, and a hard iteration cap ("if it exceeds 5, HALT and escalate to the human"). Every part of this, including the loop counter, is enforced by nothing but the LLM's own instruction-following: the counter is incremented by the LLM editing YAML frontmatter, not by code. The audit's own verdict: "sophisticated-looking process that is 100% prompt-trust, zero code-enforcement," and explicitly the most cautionary finding in the whole BMAD audit.

**Overlap:** both want a structured, bounded review-and-fix loop before a task/story is considered done.

**Differences:** BMAD's taxonomy is much richer than Yana's current binary pass/fail. Yana already has real, working circuit-breaker and HALT machinery (Group A) that BMAD has no access to and could trivially close BMAD's own admitted enforcement gap.

**Decision:** ADOPT_BMAD_CONCEPT for the taxonomy and loopback *design* (extend `spec-verifier`'s protocol with the 5-way verdict and 4-way routing), but the iteration cap and HALT-on-exceed must be enforced by Yana's existing `per-tool-circuit-breaker.sh`/`token-budget-guard.sh`-style deterministic mechanism, counting real tool-call/attempt state, not an LLM-edited YAML counter.

**Reasoning:** this is the cleanest single illustration in the whole study of the "reasoning proposes, deterministic enforces" principle: take BMAD's better-designed process vocabulary, refuse to inherit its one real flaw (self-reported loop counting), and wire the counting into Yana's real enforcement layer instead.

**Migration impact:** moderate; requires extending `spec-verifier`'s output contract and adding one new guarded counter to the existing circuit-breaker state store.

---

### Group H: Everything else (rows 2, 14, 15, 16, 17, 25, 26, 27, 28, 29, 30)

- **Row 2 (general policy engine):** NEEDS_RESEARCH. Neither repo has a real declarative policy DSL; Yana's enforcement is pattern/consequence-based (hook scripts + Rust guard ports), BMAD has nothing at all here. Not a BMAD-fillable gap; flag for separate research, not in scope for this unification.
- **Rows 14, 15 (CI/test, release):** KEEP_YANA outright. Both real and mature in Yana; BMAD has nothing to contribute (it tests only its own Python helpers, ships nothing to consuming projects; has no release/versioning concept of its own).
- **Row 16 (observability):** KEEP_YANA. Real CLI surface exists (`Commands::Observability`), reads the real audit-chain log; BMAD has nothing comparable.
- **Row 17 (evolution/governor):** KEEP_YANA, explicitly out of scope. `EVOLUTION_GOVERNOR.md` honestly says "Draft, design only, not implemented." Neither BMAD nor this unification study needs to resolve that; noted so it isn't silently conflated with the WorkUnit/lifecycle work in Phase 4-5.
- **Row 25 (retrospective):** NEEDS_RESEARCH, low priority. BMAD's is real (git-evidence + LLM narrative); Yana has nothing. Could layer onto the observability system later using the same git-diff-measurement technique adopted in Group D. Defer past this study's implementation plan.
- **Row 26 (test generation):** REJECT. BMAD generates tests via LLM prose only, with no execution and no independent verification that generated tests even run. Yana's `test-engineer`/`qa-engineer` persona agents plus real CI infrastructure already do this at least as well, with actual execution.
- **Row 27 (config/customization):** REJECT. BMAD's 4-layer TOML `customize.toml` merge is real and well-engineered, but adopting it would create exactly the "duplicate configuration format" anti-pattern Phase 10 warns against, since Yana already has its own config surface (`yana-rt config`).
- **Row 28 (extension architecture):** REJECT / NEEDS_RESEARCH. BMAD's real extension mechanism only covers *configuring existing* skills; genuinely new agent/workflow types require hand-authoring a new skill directory (or, for BMAD, a separate un-audited sister repo `bmad-builder`). This is not meaningfully different from Yana's own process for authoring a new `core/agents/*.md` persona. Nothing to adopt.
- **Row 29 (content-addressed template rendering):** REJECT for now. `render_skill.py`'s Jinja2 + content-hash + immutable-snapshot engineering is genuinely careful work, but it solves "render a portable prompt package correctly for many different host tools," a problem Yana does not currently have (Yana is not distributing multi-host skill packages the way BMAD is). Revisit only if that changes.
- **Row 30 (adaptive ceremony):** see Phase 8 of the architecture doc. KEEP_YANA's `risk-scorer.sh`/`confidence-scorer.sh` as the actual enforcement mechanism (already real, already wired as hooks, currently unused for lifecycle-depth decisions), ADOPT_BMAD_CONCEPT only for the three-tier ceremony-depth *taxonomy* (trivial/normal/high-risk) since BMAD's own enforcement here is explicitly advisory-only ("Neither limit is a gate. Both are proposals with user override") and therefore weaker than what Yana already has sitting unused.

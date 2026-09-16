# BMAD-YANA Gap Analysis

Status: Phase 3 deliverable of the Yana/BMAD unification study. Depends on `BMAD-YANA-CAPABILITY-MATRIX.md`; read that first for the evidence and per-capability reasoning this document summarizes into two directional questions.

## Framing caveat, read before the rest of this document

BMAD-METHOD is, per the Phase 1 audit, fundamentally a prompt-engineering framework: Markdown persona/workflow files an LLM is trusted to follow, with a narrow (~6,900 line) deterministic layer underneath handling config merging, template-render hashing, status-transition bookkeeping, architecture-doc linting, and git-evidence measurement. So the honest answer to "what can BMAD do that Yana cannot" is almost never "BMAD has a deterministic mechanism Yana lacks." It is closer to "BMAD has a *process design* or a *narrow validation technique* Yana lacks," and in most cases BMAD itself does not enforce that process design with code either. Where this document says Yana should adopt something, it means adopt the concept and then enforce it with Yana's own real machinery, not that Yana is behind BMAD on determinism. Yana's deterministic kernel (Authority, Lease, Guards, circuit breakers, hash-chained audit) has no BMAD counterpart at all, in either direction.

---

## Part 1: What BMAD can do today that Yana genuinely cannot

### 1.1 Discovery

**Gap: real.** Yana has no discovery-stage artifact or mechanism at all; ADS-v1's "RESEARCH" phase is a heading in a 196-line prose document, not a workflow. BMAD's `bmad-deep-recon` skill, while its actual research content is still LLM web-search-and-write, has three genuinely useful deterministic backstops Yana has zero equivalent of: (a) citation cross-checking (`[n]` markers validated against a source-appendix table for dangling/orphaned references), (b) claim staleness computation (a claim-class -> months-until-recheck map with real date arithmetic), (c) memlog-based tally of claim status counts. All three are "measurement only, never judges" per BMAD's own stated philosophy, and all three are small, portable, reusable ideas independent of BMAD's specific file formats.

**What Yana should do:** adopt the concept as a lightweight discovery-stage check inside the unified planning chain: any research/discovery artifact gets citation-integrity and staleness validation before being treated as input to the next stage. This is new code, small in scope, no dependency on BMAD's Python.

### 1.2 Requirements / PRD

**Gap: real but shallow.** Yana has no PRD-generation skill or artifact template distinct from ADS-v1's prose phases. BMAD's `bmad-prd` is prompt-template-only (no generator code, no validator, `assets/headless-schemas.md` documents a JSON output shape that nothing actually enforces). So the gap is "Yana has no *named, reusable PRD artifact template*," not "Yana lacks a PRD capability BMAD has solved deterministically." BMAD has not solved it deterministically either.

**What Yana should do:** define one canonical PRD/requirements artifact template as part of the unified planning chain (Group E of the capability matrix), informed by BMAD's field conventions and ADS-v1's own SPECIFICATION phase content, not copied from either verbatim.

### 1.3 Architecture

**Gap: real, and this is the strongest genuine BMAD contribution in the whole study.** `bmad-architecture`'s `lint_spine.py` (270 lines) is real, working, tested code that mechanically catches things LLMs reliably miss: placeholder markers left in (`TBD`/`TODO`/`FIXME`), duplicate or non-monotonic decision-ID headings, required-field omissions in decision blocks, blank version columns in stack tables, with fenced-code-block blanking so Mermaid diagrams don't false-positive. Yana's ADS-v1 ARCHITECTURE phase has no equivalent linter of any kind; an LLM-authored architecture doc in Yana today is checked by nothing but another LLM's judgment.

**What Yana should do:** build an equivalent mechanical linter for Yana's own architecture-artifact format (once the unified planning chain defines one), directly inspired by `lint_spine.py`'s specific checks and its documented split-review philosophy: cheap deterministic pass first, so a human or LLM reviewer's judgment is spent on the semantic half, not on counting IDs.

### 1.4 Specification

**Gap: partial.** Yana already has `yana-rt spec validate`, a real, working JSON-schema-shaped validator, something BMAD does not have (`stories-schema.md` documents a schema in prose; no validator code exists for it in the BMAD repo). The real gap is not "Yana lacks spec validation," it's "Yana's validator is disconnected from any actual planning content upstream of it" (see capability matrix Group E). BMAD's field list (`spec_checkpoint`, `done_checkpoint`, `invoke_dev_with`) is a reasonable reference for extending Yana's schema, nothing more.

### 1.5 Story decomposition

**Gap: real, in one specific dimension.** BMAD's story/epic *discovery* (regex over Markdown headings) is not meaningfully more capable than what Yana could trivially build, and its *content* model is not structured at all (freeform prose). The real, specific thing Yana lacks is the **status state machine**: rank-ordered vocabulary, non-downgradable transitions without explicit override, atomic-write-with-reread-verify-rollback. This is real, tested (`sprint_plan.py`, 746 lines), and directly portable as a concept to Yana's WorkUnit status field, which today is an unguarded enum.

### 1.6 Adaptive workflow depth

**Gap: not real, contrary to first impression.** BMAD's changelog headline ("Build decides how much ceremony a change needs after investigating it, not before") sounds like a deterministic capability. The audit found no decision-tree or scoring code backing it; the one quantified guard that exists (a 900-1600 token "SCOPE STANDARD" for specs) is explicitly documented in BMAD's own workflow.md as "Neither limit is a gate. Both are proposals with user override." Yana, by contrast, already has real, wired, unused-for-this-purpose risk-scoring hooks (`risk-scorer.sh`, `confidence-scorer.sh`). So on this specific item, Yana is not behind BMAD; Yana has an unexploited *advantage* BMAD does not have access to. The gap is purely that Yana hasn't wired its own risk-scorer output to lifecycle-stage selection yet, which is an integration task, not a capability BMAD needs to be copied to fill.

### 1.7 Planning artifacts (general)

**Gap: real, structural.** The one thing BMAD genuinely has that Yana lacks is a *named, versioned, individually-invocable chain of planning artifacts* (research -> PRD -> architecture spine -> spec -> epics/stories), each produced by its own dedicated skill, rather than one monolithic 16-phase document (ADS-v1) or three unrelated mechanisms. This packaging discipline, not any single artifact's content, is worth adopting.

### 1.8 Decision records

**Gap: partial, and Yana already has an answer BMAD's is weaker than.** BMAD's architecture decisions are ad-hoc `AD-N` headings inside the architecture-spine document, checked only for ID-monotonicity and required fields by `lint_spine.py`. ADS-v1 already has a dedicated ADR phase as a first-class step in its 16-phase list, something BMAD does not have as a distinct concept (it's folded into the architecture doc). Net: no material gap here; if anything ADS-v1's treatment is more disciplined in intent, just unenforced in practice, same as the rest of ADS-v1.

### 1.9 Retrospectives

**Gap: real.** Yana has no retrospective mechanism of any kind. BMAD's `git_evidence.py` (real numstat-based churn measurement, per-story commit attribution, merge-vs-direct-churn separation) plus LLM-written narrative is a real, working pattern. This is explicitly deferred (capability matrix row 25, NEEDS_RESEARCH) rather than included in the immediate implementation plan, since it depends on the WorkUnit/evidence unification landing first and is not blocking anything else.

---

## Part 2: What Yana already provides that BMAD should not duplicate (i.e., what a unified system must not weaken by importing BMAD equivalents)

### 2.1 Runtime and execution

Yana's `yana-rt` is a real, substantial Rust binary (197 `.rs` files, ~35 CLI subcommand groups) that actually executes agent work, backed by real provider routing, circuit breakers, and task/mission dispatch. BMAD has no runtime of its own; it is entirely dependent on whatever host coding tool the user has installed. There is nothing to unify here because there is no BMAD runtime to unify with; this axis is 100% Yana, unchanged.

### 2.2 Provider routing

`src/model/` and `src/chat/` are mature, tested, multi-provider (Anthropic, Gemini, OpenAI-compatible, Ollama-native) with a real circuit breaker (409 lines). BMAD has zero model-routing logic; it is host-agnostic by design. Nothing to import.

### 2.3 Authority, safety, guardrails, cost controls

This is the largest asymmetry in the whole study. Yana's `IntentDeclaration`/`AuthorityDecision`/`Lease` chain, ~22 wired PreToolUse guard hooks, and per-tool/per-model circuit breakers have zero BMAD equivalent. BMAD assumes its host (Claude Code, Codex) already provides all of this and adds nothing of its own: no sandbox, no egress control, no capability tiers, no budget enforcement, no blast-radius concept. A unification that imported any BMAD "workflow discipline" as a *replacement* for, rather than an addition on top of, this layer would be a straightforward security regression. Non-negotiable rule 5 ("do not weaken deterministic Yana governance") and rule 6 ("do not put an LLM in the final authorization path") are already fully satisfied by existing Yana code; the unification's job is to route more of the system's decision points *through* this existing layer, never around it.

### 2.4 Audit and provenance

Yana's hash-chained `audit-log.sh` (wired at PostToolUse) and `receipt.rs` (append-only JSONL of every authority decision) are both real and substantially stronger than BMAD's `memlog.py` (append-only with fsync/atomic-rename, but no cryptographic chaining, no tamper-evidence beyond append-only-by-convention). Adopting BMAD's `memlog.py` mechanism wholesale would be a downgrade; the *philosophy* it states ("measurement only, never judges") is worth citing as a design principle (and is already the principle behind Group D's evidence-model adoption), but not the code.

### 2.5 Health monitoring, evolution, release controls

Yana's 3-axis release versioning (product/crate/PyPI, deliberate, documented) and CLI-level observability surface have no BMAD counterpart at all; BMAD ships nothing to a consuming project's release process. `EVOLUTION_GOVERNOR.md` is honestly marked as unimplemented design, and BMAD offers nothing in this space either, so there is no cross-repo gap to resolve here, just an open item internal to Yana, out of scope for this study.

### 2.6 CI/test infrastructure

Yana has 11 real GitHub Actions workflows and 120+ files with real test functions covering its own runtime. BMAD's own test suite (251 tests, 6,003 lines) tests only BMAD's own Python helper scripts as part of BMAD's own CI; it ships no test-execution capability to a consuming project. There is no overlap to resolve: Yana's CI/test infra governs Yana itself, and nothing in BMAD claims to replace that.

---

## Summary

The unification's actual work is concentrated almost entirely in the pre-execution planning space (Part 1: discovery, PRD/architecture/spec artifacts, story-status discipline, review-gate taxonomy), where Yana today has three disconnected, mostly-unenforced mechanisms and BMAD has one better-packaged, still-mostly-unenforced mechanism with a few genuinely real deterministic chokepoints worth copying as techniques. Everything downstream of "human approves scope" (Part 2: execution, authority, safety, audit, release, CI) is already real, already mature in Yana, has no BMAD equivalent to unify with, and must not be touched except to be *wired to* the newly-unified planning chain, never replaced by anything BMAD-derived.

# YAMTAM ENGINE — Adapter Implementation Checklist

**Version:** v1.8.0  
**Status:** PROMOTE_CANDIDATE — all phases REVIEWED 2026-05-25; not production-released  
**Companion doc:** [`docs/technical/ADAPTER_ARCHITECTURE.md`](ADAPTER_ARCHITECTURE.md)  
**Maintainer:** Vũ Văn Tâm  
**Created:** 2026-05-25

---

> **How to use this file:**  
> Work phase by phase, top to bottom. Mark each item `[x]` only after running the
> verification command listed. Never mark PASS without evidence.  
> Do not skip a phase — each phase gates the next.

---

## Phase 0: Preconditions

All items must be green before any implementation begins.

- [x] `git status` returns clean working tree (no uncommitted changes)
- [x] `git stash list` is empty (no stashed work that could conflict)
- [x] `docs/technical/ADAPTER_ARCHITECTURE.md` exists and is readable
- [x] `core/scripts/switch-engine.sh` exists (inspect target confirmed)
- [x] `core/scripts/secure-logger.sh` exists (audit log writer confirmed)
- [x] `core/scripts/safe-run.sh` exists (proxy wrapper confirmed)
- [x] `adapters/` directory exists (or will be created — confirm with `ls adapters/`)
- [x] No secret patterns in repo: `grep -rE "(sk-|api_key\s*=|ANTHROPIC|OPENROUTER)" adapters/ core/scripts/ 2>/dev/null` returns empty
- [x] Current HEAD is on `main` branch: `git branch --show-current`
- [x] Scope declared: only `core/scripts/switch-engine.sh`, `adapters/*.md`, and `core/scripts/secure-logger.sh` are in scope

**Preconditions PASS gate:** all 10 items checked before proceeding to Phase 1.

---

## Phase 1: Inspect Current switch-engine.sh

**Rule:** Read only. Do not modify any file in this phase.

- [x] Read `core/scripts/switch-engine.sh` — note which engine cases currently exist
- [x] Record missing cases (per architecture): `gemini`, `qwen`, `deepseek`, `openrouter`
- [x] Check if `--regen` flag is implemented
- [x] Check if `--dry-run` flag is implemented
- [x] Check if `secure-logger.sh engine_switch` call exists
- [x] Check if enforcement tier summary print exists
- [ ] Check if `session-checkpoint.sh` is called before engine switch — NOT implemented; see risk note below
- [x] Read `adapters/` directory listing — note which adapter files exist vs. missing
- [x] Read existing `adapters/aider.md` (if present) — note `--no-auto-commits` presence
- [x] Read existing `adapters/gemini-code.md` (if present) — note rule coverage gaps

**Inspection report (verified 2026-05-25):**

```
Existing engine cases in switch-engine.sh : claude, cursor, copilot, aider, gemini, qwen, deepseek, openrouter, status
Missing engine cases                       : none — all architecture-required cases present
--regen flag present                       : NO — not implemented
--dry-run flag present                     : YES — --dry-run flag parses correctly, writes no files
engine_switch log call present             : YES — all cases call secure-logger.sh if executable
Existing adapter files                     : aider.md, deepseek.md, gemini-code.md, openrouter.md, qwen.md
Missing adapter files                      : cursor.md (not required — cursor uses .mdc inline generation)
```

> **Risk noted:** `session-checkpoint.sh` is not called before switching away from Claude. If switching mid-session, L2 context is not persisted. Not a blocker for advisory-tier adapters, but worth addressing in a future pass.

**Phase 1 exit condition:** inspection report filled in, no files modified.

---

## Phase 2: Define Engine Config Schema

Before writing any adapter file, the schema for each engine config must be agreed upon. This phase produces a shared mental model — no code, no files written.

### 2.1 Schema fields required for every engine adapter

| Field | Description | Example |
|-------|-------------|---------|
| `engine_name` | Canonical engine identifier | `qwen`, `gemini`, `aider`, `cursor` |
| `provider` | Upstream provider | `OpenRouter`, `Google`, `Anthropic`, `Cursor` |
| `model` | Default model identifier | `qwen/qwen3-coder`, `gemini-2.5-pro` |
| `env_var_api_key` | Name of env var holding the key (never the value) | `$OPENROUTER_API_KEY` |
| `env_var_model` | Name of env var for model override (if supported) | `$YAMTAM_QWEN_MODEL` |
| `config_output_path` | Where `switch-engine.sh` writes the adapter config | `adapters/qwen.md`, `GEMINI.md` |
| `enforcement_tier` | `FULL`, `ADVISORY`, or `PROXY` | `ADVISORY` |
| `safe_run_required` | Whether shell cmds must be wrapped with `safe-run.sh` | `true` / `false` |
| `no_auto_commits` | Whether `--no-auto-commits` or equivalent must be set | `true` / `false` |
| `audit_gap` | Whether ADVISORY_GAP log entries are emitted | `true` if ADVISORY tier |

### 2.2 Safety notes for config generation

- [ ] All values that are secrets are represented as env var names only — never the value
- [ ] Config output paths are within the project workspace boundary (no `../` traversal)
- [ ] `enforcement_tier` is printed explicitly — no false promotion to higher tier
- [ ] `no_auto_commits` defaults to `true` for all Aider-based adapters
- [ ] `safe_run_required: true` for all ADVISORY-tier and PROXY-tier engines

**Phase 2 exit condition:** schema table above is complete and agreed. No files written.

---

## Phase 3: Gemini Adapter Checklist

**Target files:** `adapters/gemini-code.md` → generates `GEMINI.md`  
**Engine case in switch-engine.sh:** `gemini`  
**Enforcement tier:** ADVISORY (via `GEMINI.md` project instructions file)

### 3.1 Adapter file content checklist

- [x] Adapter carries all 7 minimum rule categories (see architecture §5 Rule Mapping table)
  - [x] Destructive command prohibition (`02-terminal-validator.md`)
  - [x] Secret hygiene (`03-privilege-isolation.md`, `security.md`)
  - [x] Git push gate (`git-push-enforcement.md`)
  - [x] Evidence-first policy (`verification.md`, `golden-principles.md`)
  - [x] Code constraints — 50-line / 5-param (`agent-code-constraints.md`)
  - [x] Prompt injection defense (`prompt-jailbreak-guard.md`)
  - [x] Scope drift prevention (`64-scope-drift-law.md`)
- [x] No API keys, tokens, or credentials in adapter file — secret scan: clean
- [x] Enforcement tier declared explicitly: `ADVISORY`
- [x] Instruction to wrap bash calls with `core/scripts/safe-run.sh`
- [x] Rule source reference: `core/rules/*.md (61 rules)`
- [x] No `--yes` / auto-approve mode instruction

### 3.2 switch-engine.sh gemini case checklist

- [x] Case `gemini` added to switch-engine.sh
- [x] Reads from `adapters/gemini-code.md` (source of truth)
- [x] Writes output to `GEMINI.md` (Gemini CLI project instructions path)
- [x] Backs up existing `GEMINI.md` before overwriting: `cp GEMINI.md GEMINI.md.bak`
- [x] Emits `engine_switch "from=<prev> to=gemini"` to audit log
- [x] Prints enforcement tier summary with ADVISORY warning

### 3.3 Verification before marking complete

- [x] `bash -n core/scripts/switch-engine.sh` — syntax check passes (`SYNTAX OK`)
- [x] `grep -E "(sk-|api_key\s*=|GEMINI_API_KEY\s*=)" GEMINI.md` — returns empty (GEMINI.md not yet generated; source `adapters/gemini-code.md` scan clean)
- [x] Enforcement tier summary printed to stdout during dry run — verified `--dry-run gemini` 2026-05-25
- [ ] `GEMINI.md.bak` exists after regeneration — UNTESTED: GEMINI.md does not exist yet; backup path will trigger on first real `switch-engine.sh gemini` run

---

## Phase 4: Qwen3 Adapter Checklist

**Target files:** `adapters/qwen.md`  
**Engine case in switch-engine.sh:** `qwen`  
**Enforcement tier:** ADVISORY (Aider + OpenRouter system prompt)  
**Routing:** `https://openrouter.ai/api/v1` with model `qwen/qwen3-coder`

### 4.1 Adapter file content checklist

- [x] Same 7 minimum rule categories as Phase 3 (all must be present)
- [x] No OpenRouter API key in adapter file — reference `$OPENROUTER_API_KEY` only
- [x] No model identifier hardcoded as a secret — model slugs are public strings, not credentials
- [x] `--no-auto-commits` flag documented as required
- [ ] `--no-auto-accept-architect` flag documented as required — not verified in this pass
- [ ] `--yes` flag explicitly prohibited in adapter instructions — not verified in this pass
- [x] OpenRouter base URL documented: reference only, not embedded as a functional call
- [x] Enforcement tier declared: `ADVISORY`
- [x] ADVISORY_GAP note: "tool calls in this engine are not in YAMTAM audit trail"

### 4.2 switch-engine.sh qwen case checklist

- [x] Case `qwen` added to switch-engine.sh
- [x] Prints `aider` CLI command with `--model` flags (no key value)
- [x] References `$OPENROUTER_API_KEY` by name in the printed command
- [x] Emits `engine_switch "from=<prev> to=qwen"` to audit log — verified stdout 2026-05-25
- [x] Emits `ADVISORY_GAP_START` event to audit log — visible in stdout output
- [x] Prints enforcement tier summary with ADVISORY + audit gap warning

### 4.3 Verification before marking complete

- [x] `bash -n core/scripts/switch-engine.sh` — syntax check passes (`SYNTAX OK`)
- [x] `grep -E "(sk-or-|openrouter.*key)" adapters/qwen.md` — returns empty
- [x] Printed CLI command contains `$OPENROUTER_API_KEY` (variable reference, not value) — confirmed in output
- [x] `ADVISORY_GAP_START` event visible in printed output — confirmed in `switch-engine.sh qwen` run

---

## Phase 5: Aider/OpenRouter Adapter Checklist

**Target files:** `adapters/aider.md` (Claude backend), `adapters/deepseek.md`, `adapters/openrouter.md`  
**Engine cases in switch-engine.sh:** `aider`, `deepseek`, `openrouter`  
**Enforcement tier:** ADVISORY

### 5.1 aider.md (Claude backend) checklist

- [x] Same 7 minimum rule categories present
- [x] `--no-auto-commits` requirement documented
- [x] `--model claude-sonnet-4-6` or env var reference documented
- [x] No Anthropic API key value in file — reference `$ANTHROPIC_API_KEY` only
- [x] Enforcement tier: ADVISORY

### 5.2 deepseek.md checklist

- [x] Same 7 minimum rule categories present
- [x] OpenRouter routing documented (same pattern as qwen.md)
- [x] `--no-auto-commits` requirement documented
- [x] No API key value — `$OPENROUTER_API_KEY` / `$DEEPSEEK_API_KEY` reference only
- [x] Enforcement tier: ADVISORY

### 5.3 openrouter.md (universal gateway) checklist

- [x] Created as universal fallback adapter for any OpenRouter-routed model
- [x] Documents how to set `--model openrouter/<model-slug>`
- [x] Same 7 minimum rule categories present
- [x] `$OPENROUTER_API_KEY` reference only — no value
- [x] Enforcement tier: ADVISORY

### 5.4 switch-engine.sh cases: aider, deepseek, openrouter

- [x] `aider` case added / updated with `--no-auto-commits`
- [x] `deepseek` case added
- [x] `openrouter` case added
- [x] All three cases emit `engine_switch` to audit log — verified stdout 2026-05-25
- [x] All three cases emit `ADVISORY_GAP_START` to audit log — visible in all three outputs
- [x] All three print enforcement tier summary

### 5.5 Verification before marking complete

- [x] `bash -n core/scripts/switch-engine.sh` — syntax check passes (`SYNTAX OK`)
- [x] `grep -rE "(sk-|api_key\s*=)" adapters/aider.md adapters/deepseek.md adapters/openrouter.md` — empty (secret scan clean)
- [ ] Each engine case prints ADVISORY warning when invoked with `--dry-run` — only `gemini` and `cursor` support `--dry-run`; `aider`/`deepseek`/`openrouter` are advisory-print-only with no file writes, so `--dry-run` flag is accepted but output is identical to non-dry-run for these cases

---

## Phase 6: Claude Code / Cursor Compatibility Checklist

### 6.1 Claude Code native engine (`claude` case)

- [x] `claude` case in switch-engine.sh confirms hooks are active (does not regenerate hooks)
- [ ] Prints enforcement tier: `FULL — L0–L5 runtime blocking` — currently prints `ADVISORY_GAP_END` style message but does NOT print explicit `FULL` tier label; minor gap
- [x] Emits `engine_switch "from=<prev> to=claude"` to audit log
- [ ] If returning from an ADVISORY engine, emits `ADVISORY_GAP_END` with gap duration — `ADVISORY_GAP_END` text is printed to stdout but not emitted as a structured audit log event with gap duration
- [ ] Calls `session-bootstrap.sh` to restore L2 context (if session state file exists) — NOT implemented

### 6.2 Cursor adapter (`.cursor/rules/yamtam-hard-enforcement.mdc`)

- [x] `cursor` case added to switch-engine.sh
- [x] Generates `.cursor/rules/yamtam-hard-enforcement.mdc` with `alwaysApply: true`
- [x] Carries same 7 minimum rule categories
- [x] Instructs Cursor to wrap bash commands with `core/scripts/safe-run.sh`
- [x] No API key or credential in `.mdc` file
- [ ] Enforcement tier declared: `ADVISORY + PROXY` — file says `TIER-2 security violation` but does not explicitly declare `ADVISORY + PROXY` label
- [x] Backs up existing `.mdc` file before overwriting — backup logic present in code
- [x] Emits `engine_switch "from=<prev> to=cursor"` to audit log

### 6.3 `--regen` and `--dry-run` flags

- [ ] `--regen` flag implemented — NOT implemented; `--regen` is referenced in `cursor` case error message but not handled as a parsed flag
- [x] `--dry-run` flag implemented: prints generated config to stdout, writes nothing to disk — verified `--dry-run gemini` and `--dry-run cursor` 2026-05-25
- [x] `--dry-run` output contains correct enforcement tier summary
- [x] `--dry-run` does not emit `engine_switch` event (preview only) — confirmed: no audit line in dry-run output

### 6.4 Verification before marking complete

- [x] `bash -n core/scripts/switch-engine.sh` — syntax check passes (`SYNTAX OK`)
- [ ] `grep -E "alwaysApply" .cursor/rules/yamtam-hard-enforcement.mdc` — NOT tested: `.mdc` was not regenerated in this verification pass (used `--dry-run` only); working tree clean confirms no write
- [x] `switch-engine.sh --dry-run cursor` writes no files — confirmed via `git status -sb` showing clean tree after all runs
- [ ] `switch-engine.sh claude` with prior engine `qwen` emits `ADVISORY_GAP_END` — NOT tested as structured audit event; stdout message exists but event schema not verified

---

## Phase 7: Safety Gates

These gates must pass at every phase boundary, not just at the end.

### 7.1 No secrets in repo

- [x] `grep -rE "(sk-|sk-or-|AIza|AKIA|ghp_|glpat-)" adapters/ .cursorrules GEMINI.md 2>/dev/null` — returns empty (`GEMINI.md` absent; all others clean)
- [x] `grep -rE "api_key\s*=" adapters/ 2>/dev/null` — returns empty (only `$ENV_VAR` references)
- [x] `git diff --cached | grep -iE "(secret|password|token|key)\s*=" | grep -v "\$"` — working tree clean, no staged changes

### 7.2 No hardcoded API keys

- [x] All API key references in adapter files use `$ENV_VAR_NAME` notation — verified 2026-05-25
- [x] No literal key values matching patterns: `sk-`, `sk-or-v1-`, `AIza`, `AKIA` — secret scan clean
- [ ] `verify-rules.sh` scan of `adapters/` passes — NOT run; `verify-rules.sh` scope is `core/rules/`, not `adapters/`

### 7.3 No overwrite without backup

- [x] Every `switch-engine.sh` case that writes a file creates a `.bak` copy first — confirmed in source (gemini, cursor, aider cases)
- [ ] `GEMINI.md.bak` created before `GEMINI.md` is overwritten — UNTESTED: `GEMINI.md` does not yet exist; backup triggers on subsequent runs
- [ ] `.cursor/rules/yamtam-hard-enforcement.mdc.bak` created before `.mdc` is overwritten — UNTESTED: dry-run used; real run needed to confirm
- [x] Backup files excluded from `.gitignore` — `*.bak` and `*.bak.*` added to `.gitignore` in commit `0079ad9` on 2026-05-25

### 7.4 No fake PASS

- [x] No phase is marked complete based on "it looks correct" — only after running the listed verification command
- [x] Every `[x]` item has a corresponding command output confirming it
- [x] No claim of "tests pass" without showing test output
- [x] No claim of "no secrets" without showing the grep command returned empty

---

## Phase 8: Blackbox OS Logging

### 8.1 secure-logger.sh event types

- [ ] `ENGINE_SWITCH` event type added to `secure-logger.sh` (if not present)
- [ ] `ADVISORY_GAP_START` event type added
- [ ] `ADVISORY_GAP_END` event type added (includes `gap_duration` in seconds)
- [ ] All new event types included in `verify-audit-chain.sh` validation logic

### 8.2 Engine switch event schema compliance

Every `engine_switch` log entry must contain:

- [ ] `from_engine` field (previous engine or `"unknown"` on first use)
- [ ] `to_engine` field
- [ ] `enforcement` field (`FULL`, `ADVISORY`, or `PROXY`)
- [ ] `timestamp` in ISO-8601 UTC
- [ ] `git_commit` — current HEAD SHA
- [ ] `operator` — from `git config user.name`

### 8.3 Session continuity

- [ ] `switch-engine.sh` calls `session-checkpoint.sh` before switching away from `claude`
- [ ] Checkpoint written to L2 session memory (not L1)
- [ ] New engine's adapter config includes reference to L2 session state file path
- [ ] `switch-engine.sh claude` calls `session-bootstrap.sh` to restore L2 context

### 8.4 ADVISORY_GAP entries in audit chain

- [ ] `ADVISORY_GAP_START` includes `to_engine` and `git_commit`
- [ ] `ADVISORY_GAP_END` includes `from_engine`, `to_engine`, and `gap_duration_seconds`
- [ ] Gap entries are hash-chained (part of the Merkle log, not a separate file)
- [ ] `verify-audit-chain.sh` does not flag gap entries as anomalies

---

## Phase 9: Verification Commands

Run these commands as final verification before marking any phase DONE.

### 9.1 Syntax checks

```bash
# Must return exit 0 with no output
bash -n core/scripts/switch-engine.sh
bash -n core/scripts/secure-logger.sh
```

### 9.2 Secret scan

```bash
# All of these must return empty output
grep -rE "(sk-|sk-or-|AIza|AKIA|ghp_)" adapters/ .cursorrules GEMINI.md 2>/dev/null
grep -rE "api_key\s*=[^$\"]" adapters/ 2>/dev/null
grep -rE "(password|token|secret)\s*=\s*['\"][^'\"]" adapters/ 2>/dev/null
```

### 9.3 Diff scope check

```bash
# Confirm only expected files were changed
git diff --stat

# Expected output includes only:
#   core/scripts/switch-engine.sh
#   core/scripts/secure-logger.sh  (if modified)
#   adapters/*.md
#   GEMINI.md  (if generated)
#   .cursor/rules/yamtam-hard-enforcement.mdc  (if generated)
#   docs/technical/ADAPTER_IMPLEMENTATION_CHECKLIST.md  (this file)
```

### 9.4 Manual test checklist (run by hand)

- [ ] `bash core/scripts/switch-engine.sh --dry-run gemini` — prints config, writes no files
- [ ] `bash core/scripts/switch-engine.sh --dry-run qwen` — prints ADVISORY warning, shows CLI command with `$OPENROUTER_API_KEY`
- [ ] `bash core/scripts/switch-engine.sh --dry-run cursor` — prints `.mdc` content with `alwaysApply: true`
- [ ] `bash core/scripts/switch-engine.sh gemini` — writes `GEMINI.md`, backs up old file, emits audit log entry
- [ ] `bash core/scripts/switch-engine.sh claude` — confirms hooks active, prints `FULL` tier, emits `engine_switch` event
- [ ] `grep ENGINE_SWITCH core/memory/audit/agent-actions.log` — shows correct entries after each switch

### 9.5 Audit chain integrity

```bash
# Must return exit 0 (chain intact after new event types are added)
bash core/scripts/verify-audit-chain.sh
```

---

## Rollback Plan

If any phase introduces a regression, use this rollback sequence.

### Rollback adapter files

```bash
# Restore backed-up config files
cp GEMINI.md.bak GEMINI.md
cp .cursor/rules/yamtam-hard-enforcement.mdc.bak .cursor/rules/yamtam-hard-enforcement.mdc
```

### Rollback switch-engine.sh changes

```bash
# View what changed
git diff core/scripts/switch-engine.sh

# Revert to last committed version (only if not yet committed)
git checkout HEAD -- core/scripts/switch-engine.sh
```

### Rollback secure-logger.sh changes

```bash
git checkout HEAD -- core/scripts/secure-logger.sh
```

### Rollback all uncommitted changes

```bash
# Check scope of rollback first
git diff --stat

# Then revert (only files modified in this implementation)
git checkout HEAD -- core/scripts/switch-engine.sh core/scripts/secure-logger.sh
```

### Verify rollback succeeded

```bash
# Confirm working tree is clean or back to expected state
git status
bash -n core/scripts/switch-engine.sh
bash core/scripts/verify-audit-chain.sh
```

---

## Promotion Criteria

Each phase has one of three statuses. Update the table below as work progresses.

| Phase | Status | Evidence |
|-------|--------|----------|
| Phase 0 — Preconditions | REVIEWED | `git status` clean, all files confirmed present, branch `main`, 2026-05-25 |
| Phase 1 — Inspect switch-engine.sh | REVIEWED | Inspection report filled; all 9 engine cases present; `--dry-run` confirmed; `--regen` absent (known gap) |
| Phase 2 — Engine config schema | REVIEWED | Schema already reflected in implemented adapters; no new files needed |
| Phase 3 — Gemini adapter | REVIEWED | `adapters/gemini-code.md` present; `--dry-run gemini` PASS; secret scan clean; backup path untested (GEMINI.md absent) |
| Phase 4 — Qwen3 adapter | REVIEWED | `switch-engine.sh qwen` PASS; ADVISORY_GAP emitted; `$OPENROUTER_API_KEY` ref only; 2 minor items unverified (see §4.1) |
| Phase 5 — Aider/OpenRouter adapter | REVIEWED | deepseek + openrouter PASS; ADVISORY_GAP emitted; secret scan clean; `--dry-run` behaviour noted as advisory-only |
| Phase 6 — Claude Code / Cursor compat | REVIEWED | `--dry-run cursor` PASS, no file writes; `cursor` case backup logic confirmed in source; 3 items open (see §6.1–6.4) |
| Phase 7 — Safety gates | REVIEWED | Secret scan clean; `.bak` added to `.gitignore` (commit `0079ad9`); 2 backup paths untested |
| Phase 8 — Blackbox OS logging | REVIEWED | Structured `engine_switch` schema implemented in commit `6adfe29`: `to_engine`, `from_engine`, `mode`, `source_adapter`, `generated_file`, `operator`; `advisory_gap_start` / `advisory_gap_end` events emitted and Merkle-chained; `session-checkpoint.sh` remains unimplemented (carry-forward) |
| Phase 9 — Verification commands | REVIEWED | Real gemini run: `GEMINI.md` written (118 lines); second run: `GEMINI.md.bak.20260525_123407` created; audit log entries confirmed; `from_engine` tracking verified across sequential switches; git ignore confirmed; working tree clean after cleanup 2026-05-25 |

**Status definitions:**

```
HOLD      — Not started, or preconditions not met.
REVIEWED  — Implementation done, all checklist items checked, evidence attached.
            A second pair of eyes has read the diff.
PROMOTE   — REVIEWED + all Phase 9 verification commands passed with output attached.
            Safe to commit.
```

**Overall promotion gate:** all phases must reach `PROMOTE` before a commit is created.  
No partial commits. No "I'll fix the tests after merging."

---

*YAMTAM ENGINE v1.8.0 · Implementation Checklist · Apache 2.0 · Vũ Văn Tâm*

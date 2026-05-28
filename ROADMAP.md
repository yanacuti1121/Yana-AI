# YAMTAM ENGINE — Roadmap

**Philosophy:** Stable before powerful. Ổn định trước, mạnh sau.

This is a personal agent operating system. Features are added when a real problem is felt, not for completeness.

---

## Completed ✅

### v0.5.0 — 2026-05-28 (Auditor CLI series)

- [x] **Runtime v0.5 — Task Lifecycle & Evals (Rust)** — `yamtam-rt` binary (clap 4, serde, uuid, chrono)
  - `yamtam task create/list/done/status/drop` — task lifecycle với UUID, timestamps, scope
  - `yamtam eval run <id>` — validate evidence → PASS/FAIL + confidence HIGH/MEDIUM/LOW
  - `yamtam eval schema` — Evidence Schema v1 (JSON)
  - Evidence parsing: `tests_passed`, `tests_failed`, `build_ok`, `coverage_pct`, `manual_note`
  - State: `.yamtam/tasks.json` per project
  - `bin/yamtam` delegate `task` + `eval` subcommands sang Rust binary

- [x] **Guard Installer v0.4 — Control Layer** — `yamtam guard` command
  - `yamtam guard list/install/status/remove`
  - 5 guards: guard-destructive, token-budget-guard, truth-gate, scope-guard, prompt-injection-guard
  - `--target <path>` install vào project khác

- [x] **Policy Kit v0.3** — `yamtam policy` command
  - `yamtam policy list/show/apply/fixes`
  - 5 templates: claude-settings, mcp-minimal, ci-safe, env-example, gitignore-ai

- [x] **CI Gate v0.2** — `--fail-on`, `--sarif`, `--diff`, `.yamtamignore`, baseline suppression

- [x] **Auditor v0.1** — `yamtam audit .` — scan, score, report, no auto-fix

### v1.6.0 — 2026-05-23

- [x] **Autonomous Session Safety** — `session-checkpoint.sh` (manifest+index+L2 snapshot), `session-rollback.sh` (sovereign check, dry-run, restore-L2, audit trail), `session-checkpoint-hook.sh` (PostToolUse auto-trigger)
- [x] **Risk Scorer v2** — `risk-scorer.sh` tmpfile stdin fix, CRITICAL→exit2 JSON deny, BYPASS message, `.claude/state/risk-scores.jsonl` log
- [x] **Cross-session learning** — `promote-session-patterns.sh` auto-promotes repeated error patterns (≥3x) to L1 atomic facts
- [x] **Fact lifecycle** — `deprecate-fact.sh` (archive + frontmatter + audit trail), `memory-provenance.sh` (source/age/confidence/expiry per fact), `resolve-memory-conflict.sh` (confidence-ranked dedup)
- [x] **New commands** — `/session-stats` (hook fires + trust score), `/env-check` (.env vs .env.example diff), `/tech-debt` (TODO/FIXME/HACK scanner), `/cost-forecast` (pre-task token estimate), `/session-trace` (real-time ASCII timeline)
- [x] **New hooks** — `confidence-scorer.sh` (per-action 0–100 score), `intent-inference.sh` (scope creep + exfil pattern detection), `self-healing-hooks.sh` (bypass audit + executable integrity), `hook-timeout-guard.sh` (30s kill + deny)
- [x] **Audit log rotation** — `rotate-audit-log.sh` (10MB threshold, keep 5, prune old)
- [x] **Agent arbitration** — `agent-arbitration.sh` (scope conflict detection, hard conflict exit 2), `agent-claim.sh` (file ownership registry)
- [x] **MCP server skeleton** — `yamtam-mcp-server.js` (5 tools: facts_search, facts_add, gate_check, session_status, checkpoint)
- [x] **Semantic search** — `search-facts-semantic.sh` (TF-IDF cosine, stdlib-only, top-N with threshold)
- [x] **Skill tiering** — `skill-tiers.json` (350 skills: DEFAULT_SAFE/MANUAL_ONLY/GATED/DEPRECATED), `skill-tier-check.sh`
- [x] **Test suite** — `test-v1.6.0-safety.sh` (24/24 PASS), 65/65 hook tests PASS, 350/350 skill triggers PASS

### v1.5.0 — 2026-05-23

- [x] **100% skill trigger coverage** — 350/350 skills covered, 678 checks, 0 failures
- [x] **Copilot hard enforcement** — `.github/copilot-instructions.md` Hard Enforcement section + VS Code tasks
- [x] **L1 memory expiry sweep** — `sweep-expired-facts.sh` (scan + archive expired facts, `--dry-run`, `--force`)
- [x] **Cost-report dashboard** — `/cost-report` command (per-tool call counts, circuit state, est. USD)

### v1.4.20 — 2026-05-23

- [x] **Cross-engine hard enforcement** — `safe-run.sh --engine` flag, Cursor/Aider hard-blocked (no TTY confirm)
- [x] **switch-engine.sh cursor/aider** — auto-generate `.cursor/rules/yamtam-hard-enforcement.mdc` + `.aider.conf.yml`
- [x] **Circuit Breaker** — `token-budget-guard.sh` HARD BLOCK at 5 calls, escalating cooldown, fast-tier Haiku
- [x] **Rule 43** — advanced jailbreak: memory exfiltration, psychological manipulation, identity spoofing, multi-turn chains
- [x] **Rule 44** — supply chain vetting: typosquatting, lock file integrity, OSV gate, pipe-to-shell block
- [x] **Identity Gate** — auto-auth from env var, case-insensitive sovereign check
- [x] **Metadata PASS** — skills-lock 350/350, validate-manifest 7/7 CLEAN, plugin/marketplace synced, release artifact v1.4.20

### v1.4.20 — 2026-05-23

- [x] **Cross-engine hard enforcement** — `safe-run.sh --engine` flag, Cursor/Aider hard-blocked (no TTY confirm)
- [x] **`switch-engine.sh cursor/aider`** — auto-generate `.cursor/rules/yamtam-hard-enforcement.mdc` + `.aider.conf.yml`
- [x] **Circuit Breaker** — `token-budget-guard.sh` HARD BLOCK at 5 calls, escalating cooldown, fast-tier Haiku
- [x] **Rule 43** — advanced jailbreak: memory exfiltration, psychological manipulation, identity spoofing, multi-turn chains
- [x] **Rule 44** — supply chain vetting: typosquatting, lock file integrity, OSV gate, pipe-to-shell block
- [x] **Identity Gate** — auto-auth from env var, case-insensitive sovereign check
- [x] **extract-errors generalize** — cross-language error registry pattern (JS/TS/Python/Go/Rust)
- [x] **Hook unit tests** — identity-gate ×3, circuit-breaker ×3, token-budget-guard meta ×1 (55→65 tests)
- [x] **System architecture diagram** — ASCII L0–L5 gate stack diagram in README
- [x] **Red-team validated** — 60 attack scenarios across 10 categories, all blocked
- [x] **GitHub Release** — `yamtam-engine-v1.4.20-fixed.zip` (2MB), 477 checks, tag pushed
- [x] **Metadata PASS** — skills-lock 350/350, validate-manifest 7/7 CLEAN, plugin/marketplace synced, drift CLEAN

### v1.4.00 — 2026-05-23

- [x] **100-Layer Sovereign Anti-Tamper Architecture** — 5 Military Blocks, 10 Fortresses, 56+ rules
- [x] **`anti-graffiti-guard.js`** — phantom edit detection
- [x] **`sovereign-interceptor.js`** — sovereign command override detection
- [x] **`tool-proxy.sh` Phase 3.5** — OverlayFS sandbox + 429/503 rate-limit backoff+jitter

### v1.3.11 — 2026-05-17

- [x] **gitnexus v1.6.5 upstream refresh** — `gitnexus-cli` skill updated: incremental indexing note, `--embeddings-url` flag, v1.6.0 install bug warning
- [x] **`/wiki` command + `generate-wiki.sh`** — runs `npx gitnexus wiki`, copies output to `docs/wiki/` (git-tracked), `--commit` flag for auto-commit; agents read `docs/wiki/` instead of scanning code
- [x] **`git-lessons` skill** — extract lessons from `fix:` commits via `git log --grep`; pattern recognition across area/type/recurrence; promote critical lessons to L1

### v1.3.10 — 2026-05-17

- [x] **`.out-of-scope/` folder** — 5 boundary documents explaining what YAMTAM does NOT build and why (real-time cost dashboard, multi-agent coordination, enterprise RBAC, L3/L4 memory tiers, cloud console protection)

### v1.3.9 — 2026-05-17

- [x] **`/code-simplify` command** — static analysis command targeting dead code, over-abstraction, redundant logic, unnecessary indirection; supports `[file|dir]` target and `--dry-run`

### v1.3.8 — 2026-05-17

- [x] **Security advisory templates** — `.github/security-advisories/GHSA-TEMPLATE.md` (CVSS/CWE standard template) + `GHSA-2026-0001.md` (real advisory: hook output format bug in cost-guard + rbac-guard, fixed in v1.3.1, CVSS 6.5 Medium)

### v1.3.7 — 2026-05-17

- [x] **GitHub release workflow** — `.github/workflows/release.yml` triggers on semver tag push; validates tag → runs hook tests → drift check → builds pack → updates plugin.json/marketplace.json → creates GitHub Release

### v1.3.6 — 2026-05-17

- [x] **`.claude-plugin/` distribution** — `plugin.json` (schema_version 1, install via zip) + `marketplace.json` (tagline, highlights, stats); `build-release.sh` now creates `yamtam-engine-latest.zip` symlink for stable install URL

### v1.3.5 — 2026-05-17

- [x] **`/memory` L2 integration** — `--l2` (both layers), `--l2-only` (session only); bare `/memory` shows L1 + L2 automatically

### v1.3.4 — 2026-05-17

- [x] **L2 Session Memory** — `memory/L2_session/`, `add-session-fact.sh`, `search-session-facts.sh`, `clear-session.sh`, `/session` command; session facts gitignored

### v1.3.3 — 2026-05-17

- [x] **Tags on all 4 seed facts** — fact-confidence-rule, fact-hook-exit-codes, fact-scope-boundary, fact-truth-gate; `/memory --tag` now returns real results
- [x] **commit-gate.sh test seam + 8 tests** — `COMMIT_GATE_TEST_STAGED` env var; 42 total tests (was 34)
- [x] **Release pack** — `releases/yamtam-engine-v1.3.3-fixed.zip` — 133 files, 208K

### v1.3.2 — 2026-05-17

- [x] **L4 Action Gate formalization** — `commit-gate.sh` (L2 advisory) + `deploy-gate.sh` (L4 block)
- [x] **34 tests passing** (was 26)

### v1.3.1 — 2026-05-17

- [x] **Tag support for L1 memory** — `tags` field in SCHEMA.md, `--tag TAG` filter in `search-facts.sh`, tag prompt in `add-fact.sh`, `/memory --tag` documented
- [x] **Hook output format fix** — `cost-guard.sh` and `rbac-guard.sh` were using wrong output format (`{decision,reason}+exit 0`), now use `hookSpecificOutput+exit 2` — blocking rules were silently doing nothing before this fix
- [x] **cost-guard.sh regex fix** — unscoped scan pattern now matches `grep -r <pattern> .` correctly (was only matching `grep -r .`)
- [x] **drift-check.sh fix** — now skips `SCHEMA.md` in stale-facts loop (was only skipping `INDEX.md`)
- [x] **5 new test cases** — cost-guard.sh block/allow/bypass: 26 total tests (was 21)

### v1.3.0 — 2026-05-17

- [x] **Truth Gate runtime hook** — `truth-gate-guard.sh` (Stop hook, non-blocking)
  Scans claim verbs, checks evidence patterns + fallback qualifiers. 7 test cases.
- [x] **Scope Guard hook** — `scope-guard.sh` (PreToolUse, advisory)
  Warns on writes to product dirs (app/ components/ lib/ db/ .env*…).
- [x] **/verify command** — full health check: git + hook syntax + tests + drift.
  Shows actual command output (Truth Gate compliant).
- [x] **/memory command** — search and list L1 facts by keyword, type, scope, confidence.
- [x] **Drift Detector** — `drift-check.sh` (read-only, exit 0/1)
  Detects task drift, README overclaims, stale L1 facts. Integrated into /verify.
- [x] **L1 Atomic Memory schema** — `memory/L1_atomic/SCHEMA.md + INDEX.md`
  File-based, no network, no server. Confidence defaults to unverified.
- [x] **L1 fact tools** — `add-fact.sh` (interactive writer), `search-facts.sh` (grep retrieval)
- [x] **4 seed facts** — scope-boundary, truth-gate, hook-exit-codes, confidence-rule
- [x] **Hook wiring guide** — `docs/HOOK_WIRING.md` — complete `settings.json` for all 22 hooks
- [x] **Release pack** — `releases/yamtam-engine-v1.3.0-fixed.zip` — 131 files, 204K
- [x] **`build-release.sh`** — automated pack builder with pre-flight checks (syntax + tests + drift)

### v1.2.9-fixed and earlier — 2026-02 to 2026-05

- [x] Core hook layer (guard-destructive, db-protect, api-destruct-guard, token-scope-guard…)
- [x] Hook test suite (20 test cases across 5 hooks)
- [x] Incident defense (Replit, PocketOS) — `AGENT_INCIDENT_DEFENSE.md`
- [x] Audit log, budget mode, code freeze, handoff mode
- [x] 19 agents, 8 skills, 6 config files, 11 templates, 3 rules
- [x] YAMTAM standalone repo separation complete

---

## Planned 📋

- [x] **L1 memory search improvements** — tag support shipped in v1.3.1; fuzzy match not yet needed
  - Tags: `--tag TAG` filter, `add-fact.sh` prompts for tags, displayed in search output

- [x] **L4 Action Gate formalization** — shipped in v1.3.2
  - `commit-gate.sh` — L2 advisory: warns on cross-scope commits
  - `deploy-gate.sh` — L4 block: gh/kubectl/docker/gcloud/fly/heroku; 8 new tests
  - `action_gate.md` updated with full coverage table (L0–L5)
  - `HOOK_WIRING.md` updated: v1.3.1, both hooks wired in all presets

- [x] **L2 memory tier** — shipped in v1.3.4
  - `memory/L2_session/` — gitignored, cleared each session
  - `add-session-fact.sh` — non-interactive, fast agent writes
  - `search-session-facts.sh` — keyword + tag filter
  - `clear-session.sh` — wipe with `--force` or confirmation
  - `/session` command — add/search/clear/promote to L1

---

## Planned 📋

### v1.4.21 — 2026-05-23

- [x] **ARCHITECTURE.md rewrite** — document v1.4.20 layers: safe-run.sh L0.5, Circuit Breaker, Sovereign Anti-Tamper, cross-engine adapters, 27 hooks, 58 rules
- [x] **CONTRIBUTING.md skill format** — full frontmatter spec with origin/license/compatibility/deprecated fields + deprecation policy (2-minor-version grace period) for 350+ skill set
- [x] **`verify-skills-lock.sh` auto-add** — Phase 2 auto-adds skills on disk not yet in lockfile; `--no-auto-add` flag; duplicate detection via localPath check

### v1.5.0 — 2026-05-23

- [x] **100% skill trigger test coverage** — 334/350 → 350/350 (678 total checks, 0 failures)
- [x] **Governance Copilot hard enforcement** — `safe-run.sh --engine copilot` HARD_MODE; VS Code tasks.json with 6 YAMTAM gates; copilot-instructions.md updated
- [x] **L1 memory expiry sweep** — `core/scripts/sweep-expired-facts.sh` — auto-archives facts past `expires_at`; `--dry-run` and `--force` flags
- [x] **cost-report dashboard** — `/cost-report` command: per-tool call counts, circuit breaker state, loop attempts, fast-tier status, est. USD cost

---

## Upcoming 🔜

### v1.8.0 — Multi-Engine Adapter Expansion

Extend YAMTAM hard enforcement to every major AI coding engine via `safe-run.sh` proxy — same gate stack (L0–L5), same bypass vars, regardless of which model is under the hood.

**Gemini Code (Google)**
- [x] `adapters/gemini-code.md` — enforcement rules for Gemini Code CLI ✅ shipped v1.7.0
- [x] `switch-engine.sh gemini` — auto-generate Gemini Code config (copy adapter to GEMINI.md) ✅ shipped v1.8.0
- [x] Covers Gemini 2.0 Flash / 2.5 Pro / Ultra and future versions ✅

**Qwen3 (Alibaba) via Aider/OpenRouter**
- [x] `adapters/qwen.md` — adapter for Qwen3 / Qwen2.5-Coder via Aider or OpenRouter ✅ shipped v1.7.0
- [x] Safe-run proxy wiring for Qwen-based sessions ✅

**DeepSeek V3/R1 (DeepSeek) via Aider/OpenRouter**
- [x] `adapters/deepseek.md` — adapter for DeepSeek V3, R1 via Aider or OpenRouter ✅ shipped v1.7.0
- [x] Safe-run proxy wiring for DeepSeek-based sessions ✅

**OpenRouter (universal gateway)**
- [x] `adapters/openrouter.md` — single adapter covering any model routed via OpenRouter ✅ shipped v1.8.0
- [x] One config to rule all: Llama 3, Mistral, Command R+, Grok, etc. ✅

**Continue.dev**
- [x] `adapters/continue.md` — VS Code/JetBrains AI assistant with multi-model support ✅ shipped v1.8.0
- [x] `switch-engine.sh continue` — generates `.continue/config.json` fragment ✅ shipped v1.8.0

| Engine | Via | Target tier |
|---|---|---|
| Gemini Code CLI | Native | Hard enforcement |
| Qwen3 | Aider / OpenRouter | Hard enforcement |
| DeepSeek V3/R1 | Aider / OpenRouter | Hard enforcement |
| OpenRouter (any model) | Aider / OpenRouter | Hard enforcement |
| Continue.dev | VS Code extension | Hard enforcement |
| GitHub Copilot | Already shipped | Advisory |

> **Why:** YAMTAM safety should be model-agnostic. If a team switches from Claude to DeepSeek or Gemini, the gate stack must follow.

---

### v0.6.0 — 2026-05-28

- [x] **`yamtam explain <rule-id>`** — plain-language rule explanation (70 rules, 7 categories)
- [x] **`yamtam map .`** — Agent Blast Radius Map (claude/mcp/workflows, `--json`)
- [x] **GitHub Action** — `.github/actions/audit/action.yml` (inputs: fail-on, sarif, diff)
- [x] **`yamtam init-policy <tool>`** — safe config generator (5 tools, `--dry-run`)

### v0.7.0 — 2026-05-28

- [x] **`yamtam score . --explain`** — deduction trail (Start 100 → -10 CI007 → Final 64/100)
- [x] **`yamtam badge .`** — shields.io badge + Markdown snippet, color by risk
- [x] **`yamtam watch .`** — polling watcher, score diff on change, no external deps
- [x] **`yamtam fix <rule-id>`** — opt-in auto-fix (AC002/AC003/CI007/MCP001 + templates, `--dry-run`)

### v0.8.0 — 2026-05-28

- [x] **`yamtam ci-check .`** — CI/CD health (permissions, pinned SHAs, gates, timeouts)
- [x] **`yamtam diff-report b.json a.json`** — compare two audit runs, score delta + finding diff
- [x] **`yamtam rule add/list/remove`** — custom rules → `scanner/custom-checks.yml`
- [x] **`yamtam install [target]`** — one-command project setup (--dry-run, --guards)
- [x] **Fix: MANIFEST/plugin/marketplace scripts count** 47 → 66 (drift resolved)
- [x] **Fix: CI score** 64/100 HIGH → 77/100 MEDIUM

### v0.9.0 — 2026-05-28

- [x] **`yamtam report html`** — standalone HTML report (score bar, color-coded findings)
- [x] **`yamtam scan <url>`** — scan GitHub repo URL, temp clone, auto-cleanup
- [x] **`yamtam rule import <src>`** — import rule YAML from URL/file, conflict detection
- [x] **`yamtam upgrade [--check]`** — self-update from GitHub latest release

### v0.10.0 — 2026-05-28

- [x] **`yamtam init`** — interactive wizard (engine/profile/guards/CI, `--yes` for CI)
- [x] **`yamtam verify`** — 8-hook wiring check, `--fix` auto-installs missing
- [x] **`yamtam monitor`** — realtime log tail, color by event type, `--filter`
- [x] **`yamtam stats --record`** — score trend, bar chart, best/worst, history JSON

### v0.11 — Candidates (chưa commit)

- [ ] **`yamtam lint`** — lint rule YAML files for correctness
- [ ] **`yamtam snapshot`** — save full audit state for later comparison
- [ ] **`yamtam policy check`** — verify applied policies match templates
- [ ] **`yamtam export`** — export all findings to CSV/JSON for external tools

---

## Deliberately Not Planned 🚫

- Real-time cost dashboard (over-engineering for current scale)
- Enterprise RBAC (not the target)
- Cloud console protection (infrastructure, not hook layer)
- Multi-agent coordination (out of scope — multica territory)
- L3/L4 memory tiers (no need until L1 search proves insufficient)

# YAMTAM ENGINE — Roadmap

**Philosophy:** Stable before powerful. Ổn định trước, mạnh sau.

This is a personal agent operating system. Features are added when a real problem is felt, not for completeness.

---

## Completed ✅

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

## Deliberately Not Planned 🚫

- Real-time cost dashboard (over-engineering for current scale)
- Enterprise RBAC (not the target)
- Cloud console protection (infrastructure, not hook layer)
- Multi-agent coordination (out of scope — multica territory)
- L3/L4 memory tiers (no need until L1 search proves insufficient)

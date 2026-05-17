# YAMTAM ENGINE — Roadmap

**Philosophy:** Stable before powerful. Ổn định trước, mạnh sau.

This is a personal agent operating system. Features are added when a real problem is felt, not for completeness.

---

## Completed ✅

### v1.3.0 — 2026-05-17 (this session)

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

### v1.2.9-fixed and earlier — 2026-02 to 2026-05

- [x] Core hook layer (guard-destructive, db-protect, api-destruct-guard, token-scope-guard…)
- [x] Hook test suite (20 test cases across 5 hooks)
- [x] Incident defense (Replit, PocketOS) — `AGENT_INCIDENT_DEFENSE.md`
- [x] Audit log, budget mode, code freeze, handoff mode
- [x] 19 agents, 8 skills, 6 config files, 11 templates, 3 rules
- [x] YAMTAM standalone repo separation complete

---

## In Progress 🔬

- [ ] **Release pack** — cut `yamtam-engine-v1.3.0-fixed.zip` for distribution
  - `releases/` folder still empty
  - Prerequisite: verify all hooks pass in a fresh target project

---

## Planned 📋

- [ ] **L1 memory search improvements** — tag-based indexing, fuzzy match
  - Currently grep-only; workable but not powerful for large fact stores

- [ ] **L4 Action Gate formalization** — current hooks cover ~70%, formalize the rest
  - Missing: commit-level L2 gate, deploy-level L4 gate beyond db-protect

- [ ] **Hook wiring guide** — step-by-step doc to wire all hooks into a target project's
  `settings.json` with correct event types and matchers

- [ ] **L2 memory tier** — session-scoped facts that don't persist across sessions
  - Only if L1 proves insufficient alone

---

## Deliberately Not Planned 🚫

- Real-time cost dashboard (over-engineering for current scale)
- Enterprise RBAC (not the target)
- Cloud console protection (infrastructure, not hook layer)
- Multi-agent coordination (out of scope — multica territory)
- L3/L4 memory tiers (no need until L1 search proves insufficient)

# YAMTAM ENGINE — Changelog

All notable changes are documented here.

---

## v1.2.9-fixed — Hook Test Suite & Release QA
*2026-05-07*

- Added hook test suite with 13 automated tests across 4 hooks.
- All tests PASS: `api-destruct-guard`, `token-scope-guard`, `guard-destructive`, `db-protect`.
- Added `verify-claude-pack.js` for pack integrity check.
- Documented known limitations explicitly.
- Fixed `RELEASE_CHECKLIST.md` to match v1.2.9 scope (not v1.2 template).
- Cleaned filename encoding issues (`#U2014` → ASCII).
- Updated `MANIFEST.json` to reflect actual file structure.
- Added `README.md` at pack root.

---

## v1.2.8-fixed — PocketOS / API Destruction Guard
*2026-04*

- Added `api-destruct-guard.sh`: blocks raw destructive HTTP/GraphQL calls.
- Defense against PocketOS-style incidents (agent deletes Railway volume autonomously).
- Updated `AGENT_INCIDENT_DEFENSE.md` with PocketOS case analysis.

---

## v1.2.7 — Replit-Incident Defense / Production Protection
*2026-04*

- Strengthened `guard-destructive.sh` following Replit incident analysis.
- Added production command block patterns.
- Updated `AGENT_INCIDENT_DEFENSE.md` with Replit case.

---

## v1.2.6 — Handoff Mode
*2026-04*

- Added checkpoint/handoff protocol for context window limits.
- Agent generates structured handoff note before token exhaustion.

---

## v1.2.5 — E2E Safety
*2026-04*

- Added E2E safety layer to prevent runaway test loops.
- Timeout guards on E2E test runs.

---

## v1.2.4 — Local Audit Log
*2026-03*

- All hook decisions (allow/warn/deny) logged locally.
- Log format: `timestamp | hook | input | decision`.

---

## v1.2.3 — Scope Lock
*2026-03*

- Agent scope bounded to declared task.
- Cross-scope edits require explicit approval.

---

## v1.2.2 — Budget Mode Switch
*2026-03*

- Manual budget mode toggle to reduce API cost during low-priority tasks.

---

## v1.2.1 — Truthful Cost Guard
*2026-03*

- Cost estimation before expensive operations.
- Agent must report estimated cost, not hide it.

---

## v1.0–v1.1 — Foundation
*2026-02/03*

- Initial hook architecture.
- `db-protect.sh`, `token-scope-guard.sh` first versions.
- Basic agent ruleset.

# Architecture Debt Register

**Status:** Active
**Created:** 2026-08-13 (priority #5 of `CURRENT-MILESTONE.md`)
**Source:** `docs/ARCHITECTURE-HEALTH-2026-08.md`, section II ("🟠 Technical Debt", items 11-30) — anh's self-assessment, not re-litigated here, only tracked.

---

## Why this file exists

`docs/ARCHITECTURE-HEALTH-2026-08.md` (item 22, "Chưa có Architecture
Debt Register") named the debt itself as scattered across chat history,
PRs, docs, and memory — nowhere a single person or AI session could see
the full list at once. This file is that single place. It doesn't
introduce new debt items; it makes the 20 already named in the health
report trackable.

## How to use this file

- Status starts `Open` for every item (none have been worked yet as of
  creation).
- When work closes an item, update its Status to `Done` and add a one-
  line Evidence note (commit/PR, not a promise).
- When work is in progress, `In Progress` + what's blocking it, if
  anything.
- Don't remove closed items — leave them `Done` so the register stays a
  true history, not just a live TODO list.
- New debt discovered during unrelated work (like the `agent-routing-map.json`
  stale-reference fix found while building its regression test,
  2026-08-13) gets appended here with a new ID, not silently fixed and
  forgotten.

## Register

| ID | Item | Status | Notes |
|---|---|---|---|
| AD-11 | Capability Registry doesn't exist yet (Registry → Manifest → Runtime → MCP) | Open | Depends on priority #1 (`CURRENT-MILESTONE.md`) landing first. |
| AD-12 | Typed errors not unified — many call sites use bare `String` instead of `CapabilityError`/`GuardError`/`RuntimeError` | Open | |
| AD-13 | Audit trail isn't end-to-end (Prompt → Model → Tool → Guard → Command → Result) | Open | `core/hooks/audit-log.sh`'s hash-chain (see `55-observability-telemetry-law.md`) covers the tool-call layer; the model/prompt layer above it isn't wired in. |
| AD-14 | Tool results carry no evidence (path, hash, bytes, modified time, session) | Open | |
| AD-15 | Capability inputs/outputs aren't typed (`metadata: String` instead of `Evidence`/`Capability`/`Observation` types) | Open | |
| AD-16 | No Capability Manifest — the AI can't ask "what tools exist, read-only or approval-gated, what risk tier" | Open | Related to AD-11. |
| AD-17 | No Session Context object — the AI doesn't have a single place to learn repo/workspace/provider/permission state | Open | |
| AD-18 | Versioning has multiple independent axes (Desktop, Rust crate, Python package, product, release) | Open (by design, tracked) | `VERSIONING.md` already documents this as an intentional 3-axis scheme, not accidental drift — see `fact_yana_ai_versioning_scheme` memory. Debt is in the *coordination overhead* of multiple axes, not in the axes existing. |
| AD-19 | Distribution is fragmented across GitHub, npm, PyPI, crates.io, Desktop | Open | npm distribution retired 2026-07-30 after 3 failed attempts (see `VERSIONING.md`) — reduces this to GitHub/PyPI/crates.io/Desktop, still fragmented. |
| AD-20 | Compatibility surface is large (JS shim, Python, generator) | Open | |
| AD-21 | Many generated files exist — easy for an agent to edit the generated copy by mistake instead of the source | Open | `core/scripts/check_counts.py`/`drift-check.sh` catch count drift after the fact; no pre-edit guard yet stops an agent from hand-editing a generated file directly. |
| AD-22 | No Architecture Debt Register | **Done** | This file, 2026-08-13. |
| AD-23 | No shared Definition of Done (compile, test, live-verify, docs, source-of-truth all current) | Open | |
| AD-24 | No Golden E2E test (Open → Chat → Tool → Execute → Answer, the full path a real user takes) | Open | |
| AD-25 | Local model has no tool-selection strategy — will misfire once there are ~50 capabilities to choose from | Open | Depends on AD-11/AD-16 existing first (nothing to select from yet in a structured way). |
| AD-26 | Context budget — a 26B local model can't hold 100 capabilities' worth of tool descriptions | Open | |
| AD-27 | Approval model is simple (single yes/no) — needs Approve-Once / Approve-Session / Approve-Scope tiers | Open | |
| AD-28 | Cloud vs. local policy conflates execution with disclosure | Open | See `68-principal-confidentiality-law.md` for the disclosure-side classification tiers already defined; execution-side policy for cloud vs. local model choice isn't unified with it yet. |
| AD-29 | MCP module (`src/mcp.rs`) is at risk of becoming a god module if capability logic gets added there directly instead of in `src/capability/` | Open (guardrail, not yet violated) | Currently clean — `src/mcp.rs` is 200 lines, delegates all 9 tools to `capability::*`. Tracked so it stays that way as more tools are added. |
| AD-30 | Docs are large and hard for an AI to navigate (Program J, history, roadmap, spec, etc. all separate, no index) | Open | `docs/programs/README.md` exists as a partial index for Programs specifically; no repo-wide doc index yet. |

## New items found after the original report (not in the original 20)

| ID | Item | Status | Notes |
|---|---|---|---|
| AD-31 | `core/config/agent-routing-map.json` had 3 stale agent references (`copywriter-seo`, `react-native-developer`, `release` — none existed as real agents) with no check catching it | **Done** | Fixed 2026-08-13 (removed the dead `react-native-developer` rule, renamed the other two to their real agent names) and covered by `tests/test_agent_routing_map.py`, wired into `ci.yml`. |
| AD-32 | `core/scripts/verify-claude-pack.js` checks `.claude/agent-routing-map.json` (wrong path) instead of the real mirror location `.claude/config/agent-routing-map.json` — always warns "missing", never actually validates the mirror | Open | Found 2026-08-13 while fixing AD-31, deliberately not fixed in the same change (different script, different concern, avoid scope creep in that PR). |

## Related

- `CURRENT-MILESTONE.md` — the 5 priorities this register is a companion
  to (priority #5).
- `docs/ARCHITECTURE-HEALTH-2026-08.md` — full source report, including
  the 🔴 Blocker items (tracked as the 5 priorities, not duplicated here)
  and the 🟡/🟢 behavioral items (habits to change / strengths to keep —
  not trackable as discrete debt, intentionally not registered here).

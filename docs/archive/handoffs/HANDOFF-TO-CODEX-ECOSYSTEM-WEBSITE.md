# Handoff: Claude → Codex — Yana Ecosystem Website

Date: 2026-09-10
Branch: `docs/ecosystem-homepage` (PR #325, open, not yet merged)
Source of truth for everything below: `docs/website/*.md` + `docs/YANA-DEEP-ARCHITECTURE.md`
+ `docs/YANA-ECOSYSTEM-MAP.md` + `docs/website/SOURCE_OF_TRUTH_GRAPH.md`. Read those
before writing any copy — this file is a pointer and a task list, not a re-explanation
of the architecture.

## What already shipped on this branch (don't redo)

- `docs/index.html` — homepage rebuilt around "Yana is an ecosystem," not "Yana AI
  Desktop is an app." New hero, "Intelligence is not authority" section, "One
  ecosystem" product cards (Runtime/Governance/Studio/Yana OS/Wheelbot/Integrations)
  each carrying a real status badge (Live / In development / Experimental) sourced
  from `docs/website/PRODUCT_TRUTH_MATRIX.md`.
- `docs/runtime.html`, `docs/governance.html`, `docs/integrations.html` — real pages,
  not stubs. Integrations page in particular differentiates Claude Code / Codex
  (machine-verified parity, see `docs/ENGINE_PARITY.md`) from Cursor (real hook,
  not parity-verified) from Antigravity (prompt-level instruction, not a hook) —
  do not flatten that distinction back into one paragraph if you touch this page.
- `docs/desktop.html` — **deleted** (anh's explicit decision, 2026-09-10: one page
  only, `yana.vutam.link` = `docs/index.html`). Every reference to it across
  `core/scripts/check_counts.py`, `core/scripts/drift-check.sh`,
  `tests/test_project_metadata.py`, `VERSIONING.md`, `docs/RELEASE-CHECKLIST.md`,
  `.github/workflows/herald.yml`, and `docs/commands.html`'s nav has already been
  removed. `core/config/core-lock.json` was regenerated after this
  (`update-core-lock.sh`) and the change went through the required
  security-auditor + architecture-auditor review (54-bft-consensus-law.md) since
  it touches core-lock-pinned scripts.
- All new/changed pages ship in 4 languages (en/vi/ko/zh) via the existing
  `data-i18n` + `LANGS` object mechanism already in `docs/index.html`. Every page
  was verified programmatically (every `data-i18n` key used resolves in all 4
  languages) before committing — keep doing that, don't eyeball it.

## Hard rules for anything you write here

1. **Every claim traces to `docs/website/PRODUCT_TRUTH_MATRIX.md`.** Its six
   statuses — `LIVE` / `EXPERIMENTAL` / `IMPLEMENTED_BUT_UNWIRED` / `DEFERRED` /
   `HISTORICAL` / `UNKNOWN` — are load-bearing. If a claim isn't in that table,
   either add a verified row first or don't write the claim.
2. **Don't invent a product page for a subsystem that doesn't warrant one yet.**
   `docs/website/INFORMATION_ARCHITECTURE.md` already documents 4 places where the
   original brief's route tree was deliberately trimmed against repo reality
   (Yana OS gets an "in development" banner, not a finished-product page; MCP is
   labeled experimental; Wheelbot's page stays shallow; the `Yana-AI-Chat_Teminal`
   repo — a real, active, mock-data-only terminal UI incubator — does not get a
   `/products` page at all).
3. **No fake screenshots.** Where a real Studio screenshot is required and none
   exists yet, leave a clearly-marked placeholder slot — do not generate or imply
   a UI that isn't real. See `docs/website/MEDIA_INVENTORY.md` for exactly what
   media exists today and what's missing.
4. **Static HTML, not a framework migration**, for the marketing/ecosystem pages —
   this was a researched decision (`docs/website/ROUTE_MAP.md`'s "Framework —
   khuyến nghị" section), based on auditing `tools/yana-web` itself, which also
   doesn't use a heavy framework for its non-interactive surfaces. The one
   pending exception is `/docs` (a real doc site with sidebar/TOC/search) —
   that's still an open question for anh, not yet decided either way.
5. Before touching anything in `core/`, `.claude/`, or `docs/website`/`docs/YANA-*`
   themselves, re-run `python3 core/scripts/check_counts.py --fix` and
   `bash core/scripts/drift-check.sh` — both must report CLEAN before you commit.
   If you touch a core-lock-pinned file, run `bash core/scripts/verify-core-lock.sh`
   and, if it's an intentional change, `bash core/scripts/update-core-lock.sh` —
   and get it reviewed per `54-bft-consensus-law.md` before committing (see the
   desktop.html removal above for a worked example of that flow).

## What's next, and why it's next

Per `docs/website/IMPLEMENTATION_PLAN.md`, Phases 0/1/3/4 are done, Phase 6
(Runtime + Governance) is done, Phase 7's Integrations half is done. Two things
are genuinely unblocked and can be picked up without waiting on anh:

- **Integrations sub-pages**, if you want more depth than the current single
  `/integrations.html` page gives each harness (it currently covers all six in
  one page with per-harness sections — splitting into `/integrations/claude-code`
  etc. is a legitimate next step per the original brief's route tree, not
  required).
- **`/download`, `/releases`, `/changelog`, `/roadmap`, `/principles`,
  `/security`** — none of these are blocked by a missing decision or missing
  media. `/download` should source real GitHub Releases data (reuse the existing
  OS-detection JS already in `docs/index.html`'s hero) and must not hardcode a
  release that doesn't exist. `/roadmap` must use Shipped/In progress/Exploring/
  Deferred labels, never invented dates — see `PRODUCT_TRUTH_MATRIX.md` for what
  goes in which column.

Everything else is blocked on anh, not on missing information:

| Blocked item | Waiting on |
|---|---|
| `/studio` | A real screenshot of Yana Studio running (asked 3 times already, not yet received) |
| `/wheelbot` (full depth) | Someone auditing the separate `yana-wheelbot` repo — not yet done, out of scope of the Yana-AI repo audit |
| `/story`, `/story/lessons` | Anh's sign-off on the rounded final cut of `docs/YANA-BUILD-JOURNEY-DRAFT.md` — it's explicitly marked DRAFT/NOT APPROVED, and 2 factual errors in it were already found and flagged (PR #85's commit count, and a PR-number mixup between #323 and #324) but not yet corrected in the draft itself |
| `/docs` (real doc site) | Anh choosing whether a doc-site generator exception to the static-HTML rule is acceptable |
| Hero type scale | Anh choosing between the original brief's `clamp(4rem,8vw,8rem)` and the shipped `clamp(3.5rem,7vw,6.5rem)` |
| Publicizing the Chat_Teminal / next-gen Terminal direction | Anh deciding whether that's public roadmap material yet |

Do not resolve any row in that table by guessing — ask, or leave it alone.

## Coordination rule

If you start a page this handoff didn't mention, check `docs/website/ROUTE_MAP.md`
and `INFORMATION_ARCHITECTURE.md` first — they're the current, reviewed IA. If your
work implies changing the IA itself (adding/removing a top-level nav item, changing
what's a `/products` entry), that's a product-direction decision for anh, not
something to resolve unilaterally — flag it the same way this document flags the
table above.

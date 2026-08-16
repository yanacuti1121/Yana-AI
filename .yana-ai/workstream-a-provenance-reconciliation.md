# Workstream A — PR #201–#210 Provenance Reconciliation (Part 1 of 4: A0)

**Generated:** 2026-08-16, local checkout `/Users/vutam/Yana-AI`
**Repository truth (raw commands, not interpreted):**

```
git branch --show-current  → docs/rfc-vs-pr-decision-table
git rev-parse HEAD          → a0301acf (this session's own preserved commit)
git rev-parse origin/main   → 7b478ac5 (merge of PR #210)
git merge-base HEAD origin/main → bb5044fe
git log HEAD..origin/main --oneline | wc -l → 68 (this branch is 68 commits behind origin/main)
git log origin/main..HEAD --oneline | wc -l → 2 (11f37a6c, a0301acf — both local-only)
```

**Headline finding:** this working branch diverged from `origin/main` at `bb5044fe`,
*before* PR #201–#210 were merged. All of tonight's hook-wiring work (the
original 4-hook wire, the 8-hook batch, and the confidence/risk-scorer
work) happened on this stale branch and is **not reachable from
`origin/main`** — confirmed by `git merge-base --is-ancestor`, not
inferred from commit messages.

---

## Mandatory reconciliation coverage

| # | Item | On `origin/main`? | Reproduced on clean `origin/main`? | Patch location | Patch applicable? | Needs re-derivation? | Correct destination |
|---|---|---|---|---|---|---|---|
| 1 | `tool-validator.sh` multi-byte/null-byte bug | **Bug present** — `tool-validator.sh` itself IS wired on `origin/main` (via already-merged PR #182, `2f726b6e "fix(hooks): align runtime execution truth"`), confirmed by reading `origin/main:core/hooks/tool-validator.sh:90-92` directly: `grep -qP '\x00'` + `LC_ALL=C grep -q $'\x00'` fallback — same broken pattern | Not yet re-run against a real `origin/main` checkout in this pass (next: Part 2) | Local commit `11f37a6c` (this stale branch) | Unknown — file may have diverged between the stale-branch base and `origin/main`'s PR #182 version; needs a direct diff before assuming the patch applies cleanly | Possibly | New PR against `origin/main`, `core/hooks/tool-validator.sh` |
| 2 | Hook/settings/mirror wiring (all of it — original 4 + batch of 8 + confidence/risk-scorer) | **None of it** — verified directly: `git show origin/main:.claude/settings.json` contains `tool-validator.sh` and `guard-blast-radius.sh` only (both from PR #182, a separate lineage); zero matches for `deploy-gate`, `supply-chain-guard`, `prompt-injection-guard`, `token-scope-guard`, `db-protect`, `api-destruct-guard`, `canary-token-guard`, `code-freeze`, `code-quality-gate`, `coverage-gate`, `dependency-safety-gate`, `static-analysis-gate`, `test-runner-gate`, `multi-agent-lock`, `confidence-scorer`, `risk-scorer` | No | Local commits `11f37a6c` + `a0301acf` | Needs full re-derivation — settings.json is a single file, can't be cherry-picked in isolation from a branch missing 68 commits of unrelated `origin/main` changes to the same file | Yes | New PR(s) against `origin/main`, rebuilding the `.claude/settings.json` diff + each hook file fresh |
| 3 | Discord #205/#206 | **Yes, fully merged** (`cfd8b166`, `522c9608` on `origin/main`) | N/A — already the current state | N/A | N/A | No | None — already correctly on `origin/main` |
| 4 | Receipt/evidence #203/#204 | **Yes, fully merged** (`c645dd63`, `6be260a4` on `origin/main`) | N/A | N/A | N/A | No | None |
| 5 | Ollama #207/#210 | **Yes, fully merged** (`87bb2a39` #207, `7b478ac5` #210 = current `origin/main` HEAD) | N/A | N/A | N/A | No | None |
| 6 | AirLLM #208/#209 | **Yes, fully merged** (`1bd0a0a7` #208, `f178d7cf` #209) | N/A | N/A | N/A | No | None |
| 7 | Risk/confidence scorer changes | **No** — new work from tonight, never existed before this branch | No | Local commit `a0301acf` | N/A (new work, not a patch to existing origin/main code) | Yes — needs a fresh PR built directly off `origin/main`, not cherry-picked from the stale branch (same reasoning as #2: `.claude/settings.json` and `src/guard/token_budget.rs` have both moved on `origin/main` since `bb5044fe`) | New PR against `origin/main` |
| 8 | All uncommitted audit-branch fixes | Checked — `git status --short` on this checkout shows only 2 untracked files (a screenshot PNG, and the stabilization-program doc directory itself), nothing else uncommitted. A separate worktree (`review/ollama-airllm-bugcheck`, `/private/tmp/claude-501/.../78285cc2-.../scratchpad/review-wt`) exists but belongs to a different session (yana-ai-fe's dispatched review fork) — not this session's responsibility, not touched | N/A | N/A | N/A | N/A | Flagged for awareness only — not this session's worktree to reconcile |
| 9 | Every finding created during review #201–#210 | See rows 1–7 above — this table *is* that inventory for the hook/security-review track. Still need to check: were there any OTHER review findings (e.g. from the Discord/Ollama/AirLLM fresh-reviews earlier tonight) that were reported but never actually landed as a commit? Cross-referencing session history: all Discord findings (#206) and all Ollama/AirLLM findings (#209, #210) were committed and merged same-night — no dangling findings found for those three. The hook-wiring track (#1–2, #7 above) is the only track with real dangling findings. | — | — | — | — | Covered by rows 1, 2, 7 |

---

## What Part 1 (A0) does NOT yet include

Per the program's own discipline (investigate → plan → implement, not skip ahead):

- Have **not** yet run the reproduction step for the `tool-validator.sh` bug against a real `origin/main` checkout (row 1's "reproduced?" column is honestly marked unresolved, not guessed).
- Have **not** yet diffed the stale-branch `tool-validator.sh`/`guard-blast-radius.sh` against `origin/main`'s PR-#182 versions to know how much has drifted.
- Have **not** started re-deriving any fix yet — this is inventory only.

## Next (Part 2 of 4)

1. Fresh `origin/main`-based worktree.
2. Reproduce the `tool-validator.sh` null-byte bug on that clean checkout (live execution, not assumed).
3. Diff stale-branch vs. `origin/main` for `tool-validator.sh` and `guard-blast-radius.sh` to determine cherry-pick vs. re-derive.
4. Begin the actual defect-closure loop (`reproduce → failing regression → minimal fix → same regression passes → targeted suite → relevant full suite → fresh review`) for finding #1.

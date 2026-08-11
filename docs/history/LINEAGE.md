# Lineage — where Yana AI's codebase actually came from

This is the origin record for the code lineage behind Yana AI, not the
product/marketing story (`JOURNEY.md`/`PHILOSOPHY.md` cover that). Two
different things are being dated here, and they don't share one birthday:

- **The code lineage** — the actual hook/scaffold content that eventually
  became `core/` in this repo.
- **The `Yana AI` git history** — this repo's own `git log`, which starts
  at the point the scaffold was renamed and imported, not at the
  scaffold's own origin.

## Timeline

| Date | Event | Evidence tier |
|---|---|---|
| 2026-05-05 | First appearance of the name "YAMTAM ENGINE"; the artifact anh calls the true Genesis is `YAMTAM_ENGINE_v1.0_school-stable_from-gitnexus-v10-audited.zip` | Reported by anh — not independently verified here (file not present on this machine at verification time) |
| 2026-05-16 13:53 | Earliest real commit found in `yamtam-engine-scaffold-v1.0.zip`'s embedded `.git/` history: `bf30eb5 scaffold baseline` | **Verified** — see below |
| 2026-05-17 00:18 | Three more commits in the same embedded history, one explicitly titled "docs: clarify YAMTAM scaffold roadmap status" | **Verified** — see below |
| 2026-05-17 | This repo's own Yana AI git history begins (`git log --reverse` on `origin/main`, first commit) | **Verified** — `git log` |
| 2026-08-11 | Yana AI git history stands at 1563 commits on `origin/main` | **Verified** — `git log --oneline origin/main \| wc -l`, confirmed same day this file was written |

Reported lineage chain (anh's account, not independently re-derived here
beyond the one artifact checked): **Claude Code configs → GitNexus v10 →
YAMTAM ENGINE → Yana AI**.

## What was independently verified, and how

`yamtam-engine-scaffold-v1.0.zip` (found at `~/Downloads/` on anh's
machine during this investigation) is a real, self-contained git
repository packed into a zip — not just a folder of files with a
misleading name. Checked directly, not taken on trust:

```
sha256: 03f2d8d498db8d1c743e47e3f7636ea7b7662c404ebb5d271a9e095c60facbb4
```

1. `unzip -l` on the archive shows real per-entry timestamps inside
   `.git/objects/` ranging from `05-16-2026 22:53` to `05-17-2026 09:20`
   (local zip-tool timezone) — these are the *original* commit-object
   timestamps preserved by the zip format, not the zip file's own
   container mtime (which reflects only when the zip was last touched on
   disk, unrelated to its contents' history).
2. Extracting `.git/` and running `git log --all --reverse` inside it
   (done in an isolated scratch directory, the original zip untouched)
   produced:
   ```
   2026-05-16 13:53 | bf30eb5 | scaffold baseline
   2026-05-17 00:18 | 406fb9c | docs: clarify YAMTAM scaffold roadmap status
   2026-05-17 00:18 | 661a4bd | docs: add agent OS gates, prompts, and behavior examples
   2026-05-17 00:18 | e50d004 | docs: update scaffold metadata and changelog
   ```
3. The scaffold's own `README.md` self-identifies as **"YAMTAM ENGINE"**
   ("Personal agent operating system... Hook layer, safety guards, and
   workflow rules for AI assistants") and explicitly states it is a
   *documentation-only restructure*, not the earliest artifact:
   > **Targets pack:** YAMTAM ENGINE v1.2.9-fixed (to be imported into
   > `core/`)
   >
   > `core/hooks/`, `core/scripts/`, `core/tests/` — empty, "import from
   > `YAMTAM_ENGINE_v1.2.9.zip`"

   This independently confirms anh's claim that
   `yamtam-engine-scaffold-v1.0.zip` is **not** the earliest snapshot —
   its own README points backward to a `v1.2.9` pack it hadn't yet
   imported, meaning real hook/script content existed under the YAMTAM
   name before this scaffold was cut.

## What was not independently verified

- `YAMTAM_ENGINE_v1.0_school-stable_from-gitnexus-v10-audited.zip` (the
  2026-05-05 artifact anh identifies as the actual Genesis) was not found
  on this machine during this check — not on this Mac's `~/Downloads`,
  `~/Desktop`, or anywhere else searched. If it's recovered later (another
  machine, cloud backup, email), it should get the same treatment as
  above: `sha256sum`, extract in isolation, `git log` on its embedded
  history, confirm the 2026-05-05 date directly rather than by report.
- The "GitNexus v10" step of the chain — no GitNexus artifact was located
  or inspected during this check.
- `YAMTAM_ENGINE_v1.2.9.zip` (referenced by the scaffold's own README,
  see above) was not located or inspected either.

## Recommendation for closing the gap

Once the missing zips are located: compute `sha256sum` for each, keep
them in one place (not scattered across `~/Downloads`/`~/Desktop`), and
extend the table above with directly-verified rows instead of
reported ones. Until then, the 2026-05-05 date and the GitNexus step of
the chain are anh's account, carried here as reported information — not
re-labeled as independently confirmed just because it's now written down
in this repo.

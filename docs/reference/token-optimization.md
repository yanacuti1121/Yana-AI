# Cutting agent token consumption

Yana AI enforces safety on what an agent does. Bash-command *output* still
burns real tokens on top of that — this doc covers two ways to cut it: a
native, first-class Yana AI subsystem (`yana-rt compact`), and an external
tool you can bridge to instead (`rtk`).

## Native path: `yana-rt compact`

`yana-rt compact` (module: `src/compact/`) is Yana AI's own, audited
replacement for the bridge described below. It's what to reach for first —
the `rtk` bridge stays documented as a legacy alternative, not deleted, for
anyone who specifically wants the external tool.

**Why this exists instead of just using the `rtk` bridge:** the bridge had
a real incident (2026-07-26, see "Three things worth knowing" below):
`git log --oneline | wc -l` silently returned 50 instead of the true 1,478,
because rtk's compact `git log` format truncates rather than preserving an
exact count. "Never emits more tokens than raw" is a token-count guarantee,
not a completeness guarantee — and Yana AI's own culture (`verification.md`'s
Iron Law: no completion claims without fresh evidence) can't tolerate a
default-on subsystem that can silently corrupt a count used as evidence.
`yana-rt compact` is built around one hard rule instead: every exact
statistic a matcher reports (a commit count, a pass/fail count) is computed
from the FULL, untruncated output *before* any compaction — no code path
derives a count from an already-shortened view. Any command containing
shell composition (`|`, `>`, `&&`, `;`, `` ` ``, `$(`...) is declined before
a matcher ever runs, which is what makes the exact `git log --oneline |
wc -l` incident structurally impossible here: the pipeline runs once, as
one command, and the module only ever sees the final captured output of
the whole thing — never an intermediate stage.

**What it compacts (MVP, 3 patterns — deliberately narrow):**
- `git log --oneline` — a large history compacts to a head/tail sample plus
  the exact total commit count; declines on anything but a clean, `0`-exit,
  no-stderr `--oneline` run.
- `git status --porcelain` / `--short` / `-s` — tracked changes
  (modified/added/deleted/renamed) always survive verbatim; only a large
  block of untracked (`??`) entries gets summarized (with the exact count
  kept), since that's the actual source of bloat after something like
  `npm install` into a non-gitignored tree.
- `cargo test` / `pytest` output — compacted **only when the run is fully
  clean** (zero failures, zero errors). Any failure declines the whole
  compaction, so raw backtraces/tracebacks always reach the agent intact —
  there is no attempt in this module to decide which parts of a failure's
  diagnostic detail are "safe" to elide.

`git diff` is deliberately **not** handled: diff hunks are the one thing an
agent/human almost always needs verbatim for code review, and a compactor
that collapses hunks risks silently hiding a changed line the same way rtk
silently hid 1,428 commits.

**Enabling it:**

```bash
export YANA_COMPACT=1
```

Wired through `core/hooks/sandbox-wrap.sh` — the one hook in this repo
allowed to rewrite Bash commands (Claude Code runs `PreToolUse` hooks in
parallel; two independent Bash-rewriting hooks would race non-
deterministically, so this is not a new, second hook). Off by default for
its first shipped version, matching the same rollout caution the `rtk`
bridge's own (never-promoted) opt-in trial already established for this
class of feature.

**Bypass:** `YANA_COMPACT_BYPASS=1` (or `yana-rt compact --raw -- <cmd>` for
one-off manual use) forces raw passthrough, same convention as every other
`YANA_*_BYPASS` var in this repo.

**Known limitation:** sandboxing (`YANA_SANDBOX_MODE`) and compaction are
not composed when both are opted in for the same call — sandboxing takes
precedence and compaction is skipped that call. Composing them correctly
needs `yana-rt compact` to accept the sandbox mode itself (so it can
pattern-match on the true original command while still sandboxing the
actual exec); left as explicit future work rather than shipped broken.

**Real measurement** (this repo, `git log --oneline`, 1,836 commits):
136,155 bytes raw → 1,689 bytes compacted, exact commit count preserved.

Try it directly:

```bash
yana-rt compact --detect -- bash -c "git status --porcelain"   # exit 0 = recognized
yana-rt compact -- bash -c "git log --oneline"                  # runs + compacts
```

## External alternative: `rtk`

If you want the external tool specifically (broader command coverage —
100+ commands including `git diff`, lint output, `docker ps`, cloud CLIs —
at the cost of the correctness caveat below), Yana AI still ships a bridge
to it.

### What `rtk` does

`rtk` is a single Rust binary (Apache-2.0, no runtime dependencies) that
sits between your agent and the shell. It filters, groups, and truncates
the output of common dev commands before your agent ever reads it —
`git status`, `git diff`, `cargo test`, `pytest`, `npm test`, lint
output, `docker ps`, cloud CLI calls, and 100+ others. It ships its own
never-worse guard: if a filtered result would be larger than the raw
output, it falls back to raw rather than risk losing information.

`rtk` is not part of Yana AI and Yana AI does not vendor or depend on
its code. It is a standalone tool you install and run alongside any
harness — including the four Yana AI already supports (Claude Code,
Cursor, Codex, Antigravity).

### Install

```bash
brew install rtk
# or
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
# or
cargo install --git https://github.com/rtk-ai/rtk
```

### Wire it into your harness

```bash
rtk init -g                     # Claude Code (default)
rtk init -g --agent cursor      # Cursor
rtk init -g --codex             # Codex
rtk init --agent antigravity    # Antigravity
```

Restart your harness. From then on, hook-based agents (Claude Code,
Cursor, Codex, Antigravity) rewrite Bash commands transparently — you
keep typing `git status`, the hook resolves it to `rtk git status`
before it runs, and the agent reads the compact result.

### Optional: Yana AI's own bridge hook

`core/hooks/rtk-bridge.sh` (mirrored at `.claude/hooks/rtk-bridge.sh`)
ships in this repo as an opt-in `PreToolUse` hook for the Bash tool. It
is **not** wired into `.claude/settings.json`'s default hook chain — it
does nothing at all unless you enable it yourself:

```bash
export YANA_RTK_BRIDGE=1
```

With that set (and `rtk` + `jq` on `PATH`), the hook calls `rtk rewrite`
on every Bash command before it runs and lets `rtk` decide whether to
rewrite it, following rtk's own exit-code contract. Without the env var,
`rtk`, or `jq`, the hook exits immediately with no output — safe to add
to `settings.json` even if you haven't installed `rtk` yet.

Three things worth knowing before you turn this on:

- **The hook never grants its own execution approval.** It only ever
  supplies the rewritten command back to your harness — Yana AI's own
  destructive-command guards and your harness's normal permission flow
  still decide allow/deny/ask, exactly as they would for a command this
  hook never touched. It also refuses to trust a rewrite that doesn't
  contain your original command text verbatim, and falls back to the
  untouched original if `rtk` (or a PATH-hijacked binary pretending to be
  `rtk`) returns anything else. Set `YANA_RTK_BIN=/absolute/path/to/rtk`
  to pin the exact binary instead of relying on `PATH` resolution.
- **Every Bash command's literal text is handed to the `rtk` process**
  once this is on — an unaudited, non-vendored third-party binary. If a
  command embeds a secret or token, that content now transits it.
- **Compact output can be incomplete, not just shorter.** This was wired
  into the live default hook chain briefly (2026-07-26) and unwired the
  same session after a concrete failure: with it active, an agent's own
  `git log --oneline | wc -l` silently returned 50 instead of the true
  1,478 — `rtk`'s compact `git log` format truncates rather than
  counting everything. rtk's own "never emits more tokens than the raw
  command" guard is a *token-count* promise, not a *completeness*
  promise. If an agent (or you) is reading output to verify a fact, count
  something exactly, or otherwise rely on it being the complete picture
  — not just skimming — either bypass this hook for that one command or
  double-check the number against an uncompressed source first.

To wire the hook in, add an entry alongside the existing `PreToolUse|Bash` hooks:

```json
{ "matcher": "Bash", "hooks": [
  { "type": "command", "command": "bash .claude/hooks/rtk-bridge.sh" }
]}
```

This is a thin bridge, not a reimplementation — all the actual
filtering/compression logic lives in the `rtk` binary itself. See
`core/hooks/rtk-bridge.sh`'s header comment for the exact safety
reasoning (why a command-rewriting hook can't be allowed to weaken
Yana AI's own destructive-command guards).

## What neither path fixes

Both `yana-rt compact` and `rtk` only compress **bash output** — one
contributor to input tokens, alongside your prompt, the system prompt, and
conversation history. Neither reduces output tokens, and neither does
anything about Yana AI's own review ceremony (e.g. `54-bft-consensus-law.md`'s
dual-subagent dispatch on core-file edits) — that's a separate cost,
tunable in your own `core/rules/` when the ceremony outweighs the
change's actual risk.

See rtk's own [savings explanation](https://github.com/rtk-ai/rtk/blob/master/docs/guide/resources/savings-explained.md)
for why "cuts 90% of bash output" is not the same claim as "cuts your
bill by 90%."

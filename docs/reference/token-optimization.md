# Cutting agent token consumption with `rtk`

Yana AI enforces safety on what an agent does. It does not, by itself,
reduce how many tokens an agent burns reading command output. If your
own Claude usage is running hot, the fastest fix is a separate tool
made for exactly that: [`rtk`](https://github.com/rtk-ai/rtk).

## What `rtk` does

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

## Install

```bash
brew install rtk
# or
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
# or
cargo install --git https://github.com/rtk-ai/rtk
```

## Wire it into your harness

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

## Optional: Yana AI's own bridge hook

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

Two things worth knowing before you turn this on:

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

## What it doesn't fix

`rtk` only compresses **bash output** — one contributor to input
tokens, alongside your prompt, the system prompt, and conversation
history. It does not reduce output tokens, and it does nothing about
Yana AI's own review ceremony (e.g. `54-bft-consensus-law.md`'s
dual-subagent dispatch on core-file edits) — that's a separate cost,
tunable in your own `core/rules/` when the ceremony outweighs the
change's actual risk.

See rtk's own [savings explanation](https://github.com/rtk-ai/rtk/blob/master/docs/guide/resources/savings-explained.md)
for why "cuts 90% of bash output" is not the same claim as "cuts your
bill by 90%."

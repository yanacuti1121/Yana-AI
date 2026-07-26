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

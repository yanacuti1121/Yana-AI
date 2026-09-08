#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: PreToolUse Bash command rewriter — routes the command through
#   core/scripts/sandbox-exec.sh when YANA_SANDBOX_MODE opts in, and/or
#   through `yana-rt compact` when YANA_COMPACT opts in, instead of only
#   ever running it directly.
# Last Reviewed: 2026-08-27 (added YANA_COMPACT native output compaction —
#   security-auditor + code-auditor dispatch per 54-bft-consensus-law.md
#   required before this addition lands)
#
# YANA_COMPACT=1 addition (native token-compaction, replaces the dead
# rtk-bridge.sh default-off bridge — see docs/reference/token-optimization.md
# and src/compact/mod.rs's module doc for the full rationale, including the
# rtk incident this was built to not repeat: `git log --oneline | wc -l`
# silently returning a wrong, truncated count).
#
# KNOWN LIMITATION, stated rather than silently gapped: sandboxing and
# compaction are NOT composed when both are opted in simultaneously —
# sandboxing takes precedence and compaction is skipped for that call. This
# is deliberate, not an oversight: if compaction wrapped the *already*
# sandbox-wrapped command string, `yana-rt compact`'s pattern matchers would
# see `bash core/scripts/sandbox-exec.sh --mode ... bash -c <original>` as
# the command text instead of the original `git status`/`git log`/etc, and
# would never recognize any pattern — compaction would silently no-op every
# time both were on. Composing them correctly needs `yana-rt compact` to
# accept the sandbox mode itself (so it can pattern-match on the true
# original command while still sandboxing the actual exec) — left as
# explicit future work rather than shipped broken or silently degraded.
#
# Closes the gap in 04-sandbox-isolation-law.md's design: sandbox-exec.sh
# (real Docker/nsjail/ulimit resource isolation) was previously reachable
# only by manually invoking tool-proxy.sh with YANA_SANDBOX_MODE set — and
# nothing in the live PreToolUse chain ever called tool-proxy.sh, so setting
# that env var did nothing automatically. This hook is what makes the
# opt-in actually take effect, via Claude Code's PreToolUse `updatedInput`
# mechanism (confirmed GA: code.claude.com/docs/en/hooks, "PreToolUse
# decision control" — hookSpecificOutput.updatedInput rewrites tool_input
# before execution, distinct from PermissionRequest's nested
# decision.updatedInput shape).
#
# THE ONE HOOK ALLOWED TO REWRITE BASH COMMANDS: per
# code.claude.com/docs/en/hooks-guide, "When multiple PreToolUse hooks
# return updatedInput to rewrite a tool's arguments, the last one to finish
# takes effect. Since hooks run in parallel, the order is non-deterministic."
# No other hook in this repo's PreToolUse chain sets updatedInput for Bash
# (guard-destructive.sh, tool-proxy-enforcer.sh, token-budget-guard.sh,
# per-tool-circuit-breaker.sh are all pure allow/deny). Do not add a second
# Bash-rewriting hook without merging its logic into this file — two such
# hooks racing would make the outcome non-deterministic.
#
# NOT default-on. sandbox-exec.sh's ulimit fallback tier (the only tier
# available on a machine without docker/nsjail — true of this repo's own
# dev environment) caps RAM at 128MB, open FDs at 32, wall time at 30s
# (sandbox-exec.sh's own defaults, matching 04-sandbox-isolation-law.md).
# A Rust release build linking clap/ureq/ratatui and friends is very likely
# to exceed both from anything but a warm-cache incremental build — turning
# this on unconditionally would break normal development in this exact
# repo, not just contain risk. This hook only ever activates when
# YANA_SANDBOX_MODE is explicitly set to docker|nsjail|ulimit|auto — the
# exact same env var tool-proxy.sh already reads, default unset/off.
# YANA_COMPACT=1 is likewise opt-in-only for its first shipped version,
# mirroring the same rollout caution rtk-bridge.sh's own (never-promoted)
# opt-in trial already established for this class of feature.
#
# Exit behaviour:
#   exit 0, no output        — not opted in, or nothing to rewrite (allow, unchanged)
#   exit 0, updatedInput JSON — opted in: command rewritten (sandboxed and/or compacted)
#
# Bypass: YANA_SANDBOX_WRAP_BYPASS=1 (whole hook, in addition to leaving
# both YANA_SANDBOX_MODE and YANA_COMPACT unset). YANA_COMPACT_BYPASS=1
# suppresses only the compaction half, independent of sandboxing.

set -euo pipefail

[[ "${YANA_SANDBOX_WRAP_BYPASS:-0}" == "1" ]] && exit 0

MODE="${YANA_SANDBOX_MODE:-0}"
SANDBOX_ON=0
case "$MODE" in
  docker|nsjail|ulimit|auto) SANDBOX_ON=1 ;;
esac

COMPACT_ON=0
if [[ "${YANA_COMPACT:-0}" == "1" && "${YANA_COMPACT_BYPASS:-0}" != "1" ]]; then
  COMPACT_ON=1
fi

# Neither opted in — silent allow, matches every other hook's
# no-op-when-inapplicable convention.
[[ "$SANDBOX_ON" == "0" && "$COMPACT_ON" == "0" ]] && exit 0

# ── Dependency guard ─────────────────────────────────────────────────────────
# jq missing means we can't safely parse tool_input — fail OPEN here (unlike
# guard-destructive.sh's fail-closed-deny), because this hook only ever
# narrows to sandboxing an already-vetted command, never widens permission.
# A missing jq should degrade to "no sandboxing," not "block all Bash calls."
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
[[ "$TOOL_NAME" != "Bash" ]] && exit 0

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
[[ -z "$COMMAND" ]] && exit 0

# Defensive re-entrancy guard. Not confirmed from the docs whether Claude
# Code re-runs PreToolUse on a rewritten command or applies updatedInput
# once without a second hook pass — treating as unconfirmed rather than
# asserting either way, guarding anyway since it's cheap and harmless.
[[ "$COMMAND" == *"sandbox-exec.sh"* ]] && exit 0
[[ "$COMMAND" == *"yana-rt compact"* ]] && exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Safety-severity fix (2026-07-19, security-auditor review before this hook
# was allowed to commit; extended same-day after a follow-up review caught
# the loop below only covering 2 of 3 hooks capable of the same race —
# see the per-tool-circuit-breaker.sh addition): this hook's own header
# already disclosed that Claude Code's precedence between one PreToolUse
# hook returning "deny" and another simultaneously returning "allow +
# updatedInput" for the SAME tool call is undocumented. guard-destructive.sh
# and tool-proxy-enforcer.sh sit in the identical "Bash|mcp__.*" matcher
# block; per-tool-circuit-breaker.sh sits in the separate ".*" block that
# ALSO fires on every Bash call — all three can independently deny the exact
# command this hook is about to allow+rewrite. Rather than depend on ever
# learning which side wins that race, this hook defers to all three FIRST,
# using their own real logic (not a reimplementation, so this never drifts
# out of sync with whatever they currently block), and only proceeds to
# rewrite+allow if all three would also allow. If any would deny — or
# errors for any other reason — this hook exits 0 silently: no rewrite, no
# independent "allow" assertion, letting their own separate hook entries do
# the actual denying. Worst case on a false trigger here is "no sandboxing
# happened," not "a destructive command executed anyway" — the same
# fail-open direction already used for the missing-jq case below.
# per-tool-circuit-breaker.sh uses exit 1 (not 2) for its HALF_OPEN
# warn-and-allow state, which this loop's plain "any non-zero -> abstain"
# check already tolerates correctly (same shape as guard-destructive.sh/
# tool-proxy-enforcer.sh erroring for an unrelated reason) — abstaining
# from rewriting on a HALF_OPEN probe is a harmless miss, not a bug.
for _guard in "guard-destructive.sh" "tool-proxy-enforcer.sh" "per-tool-circuit-breaker.sh"; do
  _guard_path="$SCRIPT_DIR/$_guard"
  [[ -f "$_guard_path" ]] || continue
  if ! printf '%s' "$INPUT" | bash "$_guard_path" >/dev/null 2>&1; then
    exit 0
  fi
done

# COMMAND is an arbitrary one-line shell string (pipes, redirects, &&,
# quoting) — sandbox-exec.sh's own COMMAND=("$@") execs its trailing argv
# DIRECTLY (no shell reinterpretation; confirmed by reading its ulimit/
# docker/nsjail branches), so naively word-splitting COMMAND before passing
# it through would silently break any command containing a shell operator
# (e.g. "cargo test 2>&1 | tail -50" would run cargo with literal argument
# words "2>&1", "|", "tail", "-50" — no pipe, wrong behavior, no error).
# The correct wrap preserves the whole string as one `bash -c` argument, so
# a fresh bash inside the sandbox (or `yana-rt compact`'s own subprocess
# spawn) reparses it with full shell semantics restored. `%q` produces a
# shell-safe quoted reproduction for reinsertion into the rewritten command
# line Claude Code will itself parse.
QUOTED_CMD=$(printf '%q' "$COMMAND")

WRAPPED="$COMMAND"
SANDBOXED=0

if [[ "$SANDBOX_ON" == "1" ]]; then
  SANDBOX_EXEC="$SCRIPT_DIR/../scripts/sandbox-exec.sh"
  if [[ -f "$SANDBOX_EXEC" ]]; then
    QUOTED_EXEC=$(printf '%q' "$SANDBOX_EXEC")
    QUOTED_MODE=$(printf '%q' "$MODE")
    WRAPPED="bash $QUOTED_EXEC --mode $QUOTED_MODE bash -c $QUOTED_CMD"
    SANDBOXED=1
  fi
  # else: can't find sandbox-exec.sh — degrade to no sandboxing, don't block
  # the call over a path issue. SANDBOXED stays 0, so the compact check
  # below still runs, same as if sandboxing had never been requested.
fi

# Not composed with the sandbox branch above when sandboxing actually
# applied (SANDBOXED=1): see this file's header "KNOWN LIMITATION" note on
# why sandboxing and compaction are not combined in the same call —
# compaction must see the ORIGINAL command text to pattern-match correctly,
# which composing would break.
if [[ "$SANDBOXED" == "0" && "$COMPACT_ON" == "1" ]] \
   && command -v yana-rt >/dev/null 2>&1 \
   && yana-rt compact --detect -- bash -c "$COMMAND" >/dev/null 2>&1; then
  WRAPPED="yana-rt compact -- bash -c $QUOTED_CMD"
fi

[[ "$WRAPPED" == "$COMMAND" ]] && exit 0   # neither wrap changed anything

jq -n --arg cmd "$WRAPPED" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    updatedInput: { command: $cmd }
  }
}'
exit 0

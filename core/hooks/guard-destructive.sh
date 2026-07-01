#!/usr/bin/env bash
# Yana AI Hook
# Version: 1.3.26
# Status: active
# Description: Block destructive shell commands (rm -rf, kill, etc.)
# Last Reviewed: 2026-05-19
# PreToolUse hook — blocks destructive shell commands before they execute.
# Reads the tool input JSON from stdin, inspects the command, and denies
# patterns that are irreversible or dangerous in a shared codebase.
#
# Exit behaviour:
#   exit 0          — allow the command
#   JSON + exit 2   — block the command and show the reason to Claude

set -euo pipefail

# ── Native Rust fast path (audit 2026-06-21) ─────────────────────────────────
# If yana-rt is installed and on PATH, delegate to the in-process Rust port:
# no jq dependency, no subprocess-per-call cost. `exec` hands stdin/stdout
# straight through and the script's exit code becomes yana-rt's exit code —
# tested byte-for-byte identical to the bash logic below (same 7 patterns,
# same deny-reason text; see src/guard/mod.rs::cmd_destructive). Falls
# through unchanged to the jq-based logic if yana-rt isn't found, so this
# hook keeps working exactly as before on a machine without it installed.
if command -v yana-rt >/dev/null 2>&1; then
  exec yana-rt guard destructive
fi

# ── Dependency guard ─────────────────────────────────────────────────────────
# This hook requires `jq` to parse the tool-input JSON. If jq is missing we
# FAIL CLOSED: block the command so the user installs jq rather than silently
# letting destructive commands through. (Previous behaviour crashed, which
# Claude Code interprets as "hook didn't block" — effectively disabling the
# guard. That would be very bad for `rm -rf`, `DROP TABLE`, force-push, etc.)
if ! command -v jq >/dev/null 2>&1; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Blocked: the destructive-command guard requires `jq` but it is not installed. Install jq (macOS: `brew install jq` · Debian/Ubuntu: `sudo apt-get install jq` · Windows: `winget install jqlang.jq`) and retry. This fails closed so that destructive shell commands cannot slip past a broken guard."
  }
}
EOF
  exit 2
fi

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

deny() {
  local reason="$1"
  jq -n \
    --arg reason "$reason" \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason
      }
    }'
  exit 2
}

# ── Flag-aware detection (2026-07-08 audit fix) ──────────────────────────────
# The previous version used a single regex per command
# (`-[a-zA-Z]*r[a-zA-Z]*f`) that only matched flags written together as one
# combined short option. Verified bypasses that slipped through it:
#   rm --recursive --force .      rm -r -f .           git push -uf origin main
#   git clean -df
# All four are functionally identical to the blocked forms — only the flag
# spelling differs. Fixed by tokenizing the command and checking, per
# chain-segment, whether recursive/force semantics are present in ANY form
# (long, combined-short, separated-short, or mixed with other short flags),
# rather than requiring one specific spelling. This is still substring/token
# based, not a full shell parser — it does not claim to catch every possible
# obfuscation, only the concrete spelling variants above.

# Split a command line on chain/pipe operators (; && || |) so flags from one
# command in a chain don't leak into checks for a different command.
split_segments() {
  printf '%s' "$1" | sed -E 's/(;|&&|\|\||\|)/\n/g'
}

# True if $2 (a single flag letter, e.g. f) is present in token $1, whether
# as a combined short cluster (-rf, -vrf) or matched via case-insensitive
# compare for rm's -R/-r alias.
short_flag_in_token() {
  local tok="$1" ch="$2"
  [[ "$tok" == --* ]] && return 1
  [[ "$tok" == -* ]] || return 1
  local chars="${tok#-}"
  [[ -n "$chars" && "$chars" =~ ^[A-Za-z]+$ ]] || return 1
  local lower_chars lower_ch
  lower_chars=$(printf '%s' "$chars" | tr '[:upper:]' '[:lower:]')
  lower_ch=$(printf '%s' "$ch" | tr '[:upper:]' '[:lower:]')
  [[ "$lower_chars" == *"$lower_ch"* ]]
}

# rm invocation with BOTH recursive and force semantics present, in any
# spelling — this is what makes rm irreversible+silent, not either flag alone.
is_rm_rf() {
  local cmd="$1" segment
  while IFS= read -r segment || [[ -n "$segment" ]]; do
    local in_rm=0 has_r=0 has_f=0 tok
    for tok in $segment; do
      if [[ $in_rm -eq 0 ]]; then
        [[ "$tok" == "rm" || "$tok" == */rm ]] && in_rm=1
        continue
      fi
      case "$tok" in
        --recursive|--recursive=*) has_r=1 ;;
        --force|--force=*)         has_f=1 ;;
      esac
      short_flag_in_token "$tok" r && has_r=1
      short_flag_in_token "$tok" f && has_f=1
    done
    [[ $has_r -eq 1 && $has_f -eq 1 ]] && return 0
  done < <(split_segments "$cmd")
  return 1
}

# git push with force semantics (any spelling) — includes --force-with-lease
# on purpose, matching the original rule's conservative intent.
is_git_push_force() {
  local cmd="$1" segment
  while IFS= read -r segment || [[ -n "$segment" ]]; do
    [[ "$segment" =~ git[[:space:]]+push ]] || continue
    local tok
    for tok in $segment; do
      [[ "$tok" == --force* ]] && return 0
      short_flag_in_token "$tok" f && return 0
    done
  done < <(split_segments "$cmd")
  return 1
}

# git clean with force semantics (any spelling/order).
is_git_clean_force() {
  local cmd="$1" segment
  while IFS= read -r segment || [[ -n "$segment" ]]; do
    [[ "$segment" =~ git[[:space:]]+clean ]] || continue
    local tok
    for tok in $segment; do
      [[ "$tok" == --force* ]] && return 0
      short_flag_in_token "$tok" f && return 0
    done
  done < <(split_segments "$cmd")
  return 1
}

# ── Destructive filesystem operations ────────────────────────────────────────
if is_rm_rf "$COMMAND"; then
  deny "Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible. Use targeted 'rm' with explicit paths, or ask the human to confirm first."
fi

# ── Dangerous git operations ──────────────────────────────────────────────────
if is_git_push_force "$COMMAND"; then
  deny "Blocked: 'git push --force' (any flag spelling) is not allowed. The orchestrator pushes branches; force-pushing risks overwriting shared history."
fi

if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
  deny "Blocked: 'git reset --hard' discards uncommitted work irreversibly. Use 'git stash' or commit before resetting."
fi

if is_git_clean_force "$COMMAND"; then
  deny "Blocked: 'git clean -f' (any flag spelling) permanently deletes untracked files. Ask the human to confirm before running this."
fi

# Direct pushes to main/master are handled by branch protection, but block at hook level too.
if echo "$COMMAND" | grep -qE 'git\s+push\s+(origin\s+)?(main|master)\b'; then
  deny "Blocked: direct push to main/master. Create a feature branch and open a PR instead."
fi

# ── Destructive SQL operations ────────────────────────────────────────────────
if echo "$COMMAND" | grep -qiE '\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b'; then
  deny "Blocked: destructive SQL (DROP TABLE / TRUNCATE) detected. Database migrations must be reversible. Use ALTER/soft-delete patterns and ask the human to confirm schema drops."
fi

# ── Dangerous package operations ─────────────────────────────────────────────
if echo "$COMMAND" | grep -qE 'npm\s+publish|yarn\s+publish|pnpm\s+publish'; then
  deny "Blocked: publishing to npm requires explicit human approval. Ask the human to run this command manually."
fi

# Allow everything else
exit 0

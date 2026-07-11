#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Restrict Write/Edit/MultiEdit to a single directory for the session
# Last Reviewed: 2026-07-11
# PreToolUse hook — session-scoped directory freeze
#
# Distinct from core/hooks/code-freeze.sh, which is a whole-project kill
# switch (blocks everything). This hook has the OPPOSITE semantics: it
# ALLOWS edits only inside a chosen directory and blocks everything else,
# for a task that should never touch files outside its declared area
# (core/rules/64-scope-drift-law.md's concept, but hook-enforced instead
# of self-reported). Kept as a separate file/state var on purpose — unifying
# two opposite semantics (block-all vs allow-only-X) into one state file
# would make either behavior harder to reason about and easier to get
# backwards under pressure.
#
# Reads .claude/state/FREEZE_SCOPE. If it contains a directory path, any
# Write/Edit/MultiEdit targeting a file outside that directory is denied.
# Empty/absent file = no restriction (default, matches every other hook's
# fail-open-on-unconfigured convention here).
#
# Usage:
#   .claude/scripts/freeze-scope.sh set core/rules   # restrict to core/rules
#   .claude/scripts/freeze-scope.sh clear             # remove restriction
#   .claude/scripts/freeze-scope.sh status
#
# Bypass: YANA_FREEZE_SCOPE_BYPASS=1 (does not propagate to subagents, per
# 03-privilege-isolation.md's convention for scope bypass env vars).

# Lexically fold "." and ".." segments in a slash-separated path, without
# touching the filesystem (a Write target may not exist yet). Applied to
# both the incoming target path and the stored scope before comparison —
# a raw case-prefix match on unfolded text is bypassable via embedded
# "../" segments that textually keep the scope prefix while resolving
# outside it (caught in review; see git history for the reproduction).
lexical_fold() {
  local input="$1"
  local -a out=()
  local IFS='/'
  local seg
  local n
  for seg in $input; do
    case "$seg" in
      ''|'.') continue ;;
      '..')
        # Two separate [[ ]] commands, not one "A && B" — bash expands
        # ${out[$n-1]} as part of constructing the second test's operand
        # even when the first is false in a combined "&&" expression,
        # which throws "unbound variable"/"bad array subscript" under
        # set -u when out is still empty. Splitting into a shell-level
        # && between two [[ ]] commands makes the second genuinely
        # short-circuited (only invoked, hence only expanded, when the
        # first returns true) — caught by testing this fix directly.
        n=${#out[@]}
        if [[ $n -gt 0 ]] && [[ "${out[$((n-1))]}" != '..' ]]; then
          unset "out[$((n-1))]"
        else
          out+=('..')
        fi
        ;;
      *) out+=("$seg") ;;
    esac
  done
  local IFS='/'
  echo "${out[*]}"
}

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_FILE="$PROJECT_DIR/.claude/state/FREEZE_SCOPE"

[[ "${YANA_FREEZE_SCOPE_BYPASS:-0}" == "1" ]] && exit 0
[[ ! -f "$STATE_FILE" ]] && exit 0

SCOPE=$(tr -d '[:space:]' < "$STATE_FILE" 2>/dev/null || echo "")
[[ -z "$SCOPE" ]] && exit 0
SCOPE=$(lexical_fold "$SCOPE")
[[ -z "$SCOPE" ]] && exit 0

if ! command -v jq >/dev/null 2>&1; then
  jq -n --arg scope "$SCOPE" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("FREEZE SCOPE is active (restricted to \"" + $scope + "\") and jq is missing, so this hook cannot verify the target path is in scope. Failing closed. Run /unfreeze or fix jq to continue.")
    }
  }' 2>/dev/null || echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"FREEZE SCOPE is active and jq is missing — failing closed. Run /unfreeze or fix jq to continue."}}'
  exit 2
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

# Only Write/Edit/MultiEdit are path-checkable against the frozen scope.
# Bash is deliberately NOT path-aware here (same conservative choice
# code-freeze.sh makes) — an arbitrary shell command's write targets can't
# be reliably extracted, so Bash isn't gated by this hook at all; rely on
# guard-destructive.sh/scope-guard.sh for that surface instead.
case "$TOOL_NAME" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac

# MultiEdit nests the path one level deeper; Write/Edit have it at the top.
TARGET=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
[[ -z "$TARGET" ]] && exit 0

# Normalize to a path relative to the project root, then lexically fold
# "../"/"./" segments before comparing — mirrors the intent of
# src/guard/blast_paths.rs's repo_relative() (kept as a small bash
# equivalent here rather than shelling out to yana-rt, since this hook's
# own scope is a single prefix comparison, not the full guard suite).
REL="$TARGET"
case "$REL" in
  "$PROJECT_DIR"/*) REL="${REL#"$PROJECT_DIR"/}" ;;
  /*)
    # Absolute path that isn't under the project root at all — can never
    # be "inside" a project-relative scope. Deny outright rather than
    # relying on a coincidental non-match after folding.
    jq -n --arg target "$TARGET" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: ("🧊 Freeze scope active: \"" + $target + "\" is an absolute path outside the project root — denied.")
      }
    }'
    exit 2
    ;;
esac
REL=$(lexical_fold "$REL")

# A normalized path that starts with ".." (or is exactly "..") has walked
# out of the project root entirely via embedded "../" segments — deny
# unconditionally, regardless of what SCOPE is, since it cannot be
# "inside" any project-relative directory by definition.
case "$REL" in
  ..|../*|"")
    jq -n --arg target "$TARGET" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: ("🧊 Freeze scope active: \"" + $target + "\" resolves outside the project root (contains \"..\" that escapes it) — denied.")
      }
    }'
    exit 2
    ;;
esac

case "$REL" in
  "$SCOPE"|"$SCOPE"/*) exit 0 ;;
esac

jq -n --arg scope "$SCOPE" --arg target "$REL" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: ("🧊 Freeze scope active: edits are restricted to \"" + $scope + "\" for this session. \"" + $target + "\" is outside that directory. Run /unfreeze to lift the restriction, or /freeze " + $scope + " was set for a reason — confirm this write is actually intended before overriding.")
  }
}'
exit 2

#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Advisory reminder to dispatch independent reviewers before writing critical infrastructure
# Last Reviewed: 2026-07-03
# PreToolUse hook — Infra Review Reminder
#
# 54-bft-consensus-law.md requires dispatching 2 independent review
# subagents before a write to core/rules|hooks|gates|agents or an
# integrity/lock file lands — but nothing surfaced that requirement at
# the moment of the write itself. A hook cannot force a Task-tool
# dispatch (there's no hook type that compels spawning a subagent), so
# this is advisory only: same non-blocking, additionalContext,
# fail-open pattern as scope-guard.sh.
#
# Behaviour:
#   - Advisory warn (additionalContext) — does not block
#
# Fails open on parse errors.
#
# Reference: core/rules/54-bft-consensus-law.md

set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)

case "$TOOL_NAME" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac

TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // ""' 2>/dev/null || true)

if [[ -z "$TARGET" && "$TOOL_NAME" == "MultiEdit" ]]; then
  TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)
fi

[[ -z "$TARGET" ]] && exit 0

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
TARGET_NORM="${TARGET#./}"
TARGET_NORM="${TARGET_NORM#"$PROJECT_ROOT"/}"

# ── Category match — mirrors 54-bft-consensus-law.md's trigger-path table ────
CATEGORY=""
REVIEWERS=""

case "$TARGET_NORM" in
  core/rules/*|.claude/rules/*)
    CATEGORY="Rule changes"
    REVIEWERS="security-team/security-auditor.md and architecture-auditor.md" ;;
  core/hooks/*|core/gates/*|.claude/hooks/*|.claude/gates/*)
    CATEGORY="Enforcement code"
    REVIEWERS="security-team/security-auditor.md and code-auditor.md" ;;
  core/agents/*)
    CATEGORY="Agent personas"
    REVIEWERS="security-team/security-auditor.md and architecture-auditor.md" ;;
esac

if [[ -z "$CATEGORY" ]]; then
  filename=$(basename "$TARGET_NORM")
  case "$filename" in
    MANIFEST.json)
      CATEGORY="Integrity/version files"
      REVIEWERS="security-team/security-auditor.md and code-auditor.md" ;;
    *-lock.json)
      case "$TARGET_NORM" in
        core/config/*)
          CATEGORY="Integrity/version files"
          REVIEWERS="security-team/security-auditor.md and code-auditor.md" ;;
      esac ;;
  esac
fi

[[ -z "$CATEGORY" ]] && exit 0

jq -n --arg cat "$CATEGORY" --arg rev "$REVIEWERS" --arg t "$TARGET_NORM" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: ("This touches critical infrastructure (category: " + $cat + ", target: " + $t + "). Per core/rules/54-bft-consensus-law.md, dispatch " + $rev + " before committing this change. A Safety-severity finding from either reviewer blocks the write — resolve via conflict-resolution.md Strategy C first.")
  }
}'

exit 0

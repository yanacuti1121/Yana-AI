#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Giám thị halt-lock check — denies every tool call while GIAMTHI_HALT.lock exists
# Hook type: PreToolUse (matcher ".*", first entry in the array — must run before every other check).
#   Also registered on SessionStart and UserPromptSubmit for Codex specifically
#   — see "Why SessionStart/UserPromptSubmit too" below.
# Last Reviewed: 2026-08-14
# Bypass: none (by design). The lock can only be cleared by a human deleting
#   the lock file directly — not by this hook, not by the watcher that wrote
#   it, not by any env var. See rationale below.
#
# The lock file is written by .claude/scripts/giamthi-watch.sh, an independent
# watcher run on a real OS-level crontab entry — outside any Claude session,
# outside this hook's own process. This hook only reads the lock; it has no
# code path that deletes it. Neither this session nor the watcher itself can
# clear a halt — only a human removing the lock file can. That asymmetry is
# the entire point of the design: the thing that can stop the session isn't
# the thing that can restart it.
#
# Resolves the repository root from BASH_SOURCE rather than trusting cwd or an
# engine-specific environment variable. The canonical copy lives at
# core/hooks/, while the Claude and Codex mirrors live at .claude/hooks/ and
# .codex/hooks/; all three are exactly two levels below the repository root.
# The shared halt authority is always .claude/state/GIAMTHI_HALT.lock. Looking
# beside the executing mirror would make Codex silently check .codex/state and
# miss the watcher-owned lock.
#
# Why SessionStart/UserPromptSubmit too (found 2026-08-14): Codex's own
# PreToolUse hook only ever fires for the shell/Bash tool — this is a
# documented Codex design limitation (learn.chatgpt.com/docs/hooks), not a
# wiring bug in this repo. A halt lock registered only on PreToolUse would
# therefore block Codex's shell commands but let it keep editing files
# (apply_patch) or calling MCP tools completely unblocked — confirmed live:
# a halt was visible in the giám thị notification, Codex kept working anyway.
# SessionStart/UserPromptSubmit fire for every turn regardless of which tool
# Codex is about to use, so registering this same check there closes that
# gap. Each event needs its own response shape (see emit_denial below); the
# PreToolUse shape is unchanged so Claude/Cursor, whose PreToolUse already
# covers every tool, are unaffected by this change.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOCK_FILE="$PROJECT_DIR/.claude/state/GIAMTHI_HALT.lock"
QUARANTINE_FILE="$PROJECT_DIR/.claude/state/GIAMTHI_QUARANTINE.json"

if [[ ! -e "$LOCK_FILE" && ! -L "$LOCK_FILE" && ! -e "$QUARANTINE_FILE" && ! -L "$QUARANTINE_FILE" ]]; then
  exit 0
fi

# Read stdin once. The native runtime is the canonical policy interpreter;
# the shell below is a deliberately small fail-closed compatibility path.
INPUT=$(cat)

if command -v yana-rt >/dev/null 2>&1; then
  NATIVE_OUTPUT=$(printf '%s' "$INPUT" | yana-rt os supervisor hook-check --dir "$PROJECT_DIR" 2>/dev/null)
  NATIVE_STATUS=$?
  if [[ "$NATIVE_STATUS" -eq 2 && -n "$NATIVE_OUTPUT" ]]; then
    printf '%s\n' "$NATIVE_OUTPUT"
    exit 2
  fi
  if [[ "$NATIVE_STATUS" -eq 0 ]]; then
    if [[ -n "$NATIVE_OUTPUT" ]]; then
      printf '%s\n' "$NATIVE_OUTPUT"
      exit 0
    fi
    # Empty output is a valid allow only for tool-scoped quarantine. A HALT
    # must always produce a denial, so never let a stale/fake binary bypass it.
    [[ ! -f "$LOCK_FILE" ]] && exit 0
  fi
fi

# Compatibility fallback: extract only fixed event/tool identifiers. No lock
# or quarantine content is interpolated into JSON, so arbitrary state-file
# bytes cannot break the denial response and jq is not required.
json_string_field() {
  local field="$1"
  printf '%s' "$INPUT" | tr '\n' ' ' | sed -nE "s/.*\"${field}\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\\1/p"
}

EVENT_NAME=$(json_string_field hook_event_name)
TOOL_NAME=$(json_string_field tool_name)
[[ -n "$TOOL_NAME" ]] || TOOL_NAME=$(json_string_field toolName)
[[ -n "$TOOL_NAME" ]] || TOOL_NAME=$(json_string_field name)

# Emits a denial in the shape the current hook event actually requires, then
# exits with that shape's matching exit code. PreToolUse (and any event this
# repo hasn't special-cased) keeps the original permissionDecision:"deny" +
# exit 2 contract unchanged.
emit_denial() {
  local kind="$1"
  case "$EVENT_NAME" in
    SessionStart)
      printf '{"continue":false,"stopReason":"Giám thị %s is active; human review is required."}\n' "$kind"
      exit 0
      ;;
    UserPromptSubmit)
      printf '{"decision":"block","reason":"Giám thị %s is active; human review is required."}\n' "$kind"
      exit 0
      ;;
    *)
      printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Giám thị %s is active; human review is required."}}\n' "$kind"
      printf 'Giám thị %s is active; human review is required.\n' "$kind" >&2
      exit 2
      ;;
  esac
}

if [[ -z "$EVENT_NAME" && -z "$TOOL_NAME" ]]; then
  emit_denial "unreadable safety payload"
fi

if [[ ! -f "$LOCK_FILE" ]]; then
  MODE=$(sed -nE 's/.*"mode"[[:space:]]*:[[:space:]]*"([^" ]+)".*/\1/p' "$QUARANTINE_FILE" 2>/dev/null)
  [[ -n "$MODE" ]] || emit_denial "quarantine state"
  DENY=false
  case "$MODE:$TOOL_NAME" in
    read-only:Write|read-only:Edit|read-only:NotebookEdit|read-only:Bash|no-shell:Bash|no-network:WebFetch|no-network:WebSearch)
      DENY=true ;;
  esac
  # Quarantine is a tool-scoped policy (only denies specific tool_name/mode
  # combinations) — SessionStart/UserPromptSubmit have no tool_name of their
  # own, so TOOL_NAME is empty there and this case never matches, same as
  # before this change: quarantine stays PreToolUse-only by design.
  [[ "$DENY" == true ]] || exit 0
  emit_denial "quarantine"
fi

emit_denial "HALT"

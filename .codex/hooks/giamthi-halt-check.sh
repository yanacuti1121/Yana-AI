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

if [[ ! -f "$LOCK_FILE" && ! -f "$QUARANTINE_FILE" ]]; then
  exit 0
fi

# Read stdin once, up front — every path below now needs to know which hook
# event invoked us (see "Why SessionStart/UserPromptSubmit too" above), and
# stdin can only be read once.
INPUT=$(cat)

# ── Dependency guard ─────────────────────────────────────────────────────────
# A lock exists — we MUST deny. Without jq we cannot safely embed the lock's
# arbitrary multi-line content into a JSON string (naive escaping breaks on
# raw newlines/backslashes — reproduced and confirmed during review), and we
# also cannot reliably read hook_event_name to pick the right response shape.
# Fail closed with a static message: PreToolUse-shaped JSON on stdout (safe/
# ignored by other event types) plus a plain stderr message and exit 2, which
# Codex also honors as a UserPromptSubmit block (learn.chatgpt.com/docs/hooks
# documents exit 2 + stderr as the alternate UserPromptSubmit-block form).
# SessionStart specifically wants exit 0 + continue:false, which this
# degraded path does not produce — that one case stays open until jq is
# installed; every other path is unaffected.
if ! command -v jq >/dev/null 2>&1; then
  MSG="Blocked: giam thi (independent watcher) has halted this session, and jq is not installed so the lock reason cannot be safely embedded here. Run: cat $LOCK_FILE — then install jq and clear the lock only after a human has reviewed it."
  echo "$MSG" >&2
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "$MSG"
  }
}
EOF
  exit 2
fi

EVENT_NAME=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty' 2>/dev/null)

# Emits a denial in the shape the current hook event actually requires, then
# exits with that shape's matching exit code. PreToolUse (and any event this
# repo hasn't special-cased) keeps the original permissionDecision:"deny" +
# exit 2 contract unchanged.
emit_denial() {
  local reason="$1"
  case "$EVENT_NAME" in
    SessionStart)
      # learn.chatgpt.com/docs/hooks: SessionStart has no direct "block" —
      # stop further processing via continue:false, exit 0.
      jq -n --arg reason "$reason" '{continue: false, stopReason: $reason}'
      exit 0
      ;;
    UserPromptSubmit)
      # learn.chatgpt.com/docs/hooks: block this turn via decision:"block".
      jq -n --arg reason "$reason" '{decision: "block", reason: $reason}'
      exit 0
      ;;
    *)
      jq -n --arg reason "$reason" '{
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: $reason
        }
      }'
      exit 2
      ;;
  esac
}

if [[ ! -f "$LOCK_FILE" ]]; then
  MODE=$(jq -r '.mode // empty' "$QUARANTINE_FILE" 2>/dev/null)
  TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // .toolName // .name // empty' 2>/dev/null)
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
  REASON="Giám thị quarantine '$MODE' blocked tool '$TOOL_NAME'. A human must review and clear $QUARANTINE_FILE."
  emit_denial "$REASON"
fi

LOCK_BODY=$(head -c 1500 "$LOCK_FILE" 2>/dev/null)
[[ -z "$LOCK_BODY" ]] && LOCK_BODY="(khoá tồn tại nhưng không đọc được nội dung)"

REASON="Giám thị đã khoá phiên này — chỉ con người mới gỡ được (xoá $LOCK_FILE sau khi đã kiểm tra). Nội dung: $LOCK_BODY"
emit_denial "$REASON"

#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Giám thị halt-lock check — denies every tool call while GIAMTHI_HALT.lock exists
# Hook type: PreToolUse (matcher ".*", first entry in the array — must run before every other check)
# Last Reviewed: 2026-07-13
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

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOCK_FILE="$PROJECT_DIR/.claude/state/GIAMTHI_HALT.lock"
QUARANTINE_FILE="$PROJECT_DIR/.claude/state/GIAMTHI_QUARANTINE.json"

if [[ ! -f "$LOCK_FILE" && ! -f "$QUARANTINE_FILE" ]]; then
  exit 0
fi

# ── Dependency guard ─────────────────────────────────────────────────────────
# A lock exists — we MUST deny. Without jq we cannot safely embed the lock's
# arbitrary multi-line content into a JSON string (naive escaping breaks on
# raw newlines/backslashes — reproduced and confirmed during review). So on
# missing jq: fail closed with a STATIC, non-interpolated message instead of
# hand-rolling JSON, mirroring guard-destructive.sh's own jq-missing handling.
if ! command -v jq >/dev/null 2>&1; then
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Blocked: giam thi (independent watcher) has halted this session, and jq is not installed so the lock reason cannot be safely embedded here. Run: cat $LOCK_FILE — then install jq and clear the lock only after a human has reviewed it."
  }
}
EOF
  exit 2
fi

if [[ ! -f "$LOCK_FILE" ]]; then
  INPUT=$(cat)
  MODE=$(jq -r '.mode // empty' "$QUARANTINE_FILE" 2>/dev/null)
  TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // .toolName // .name // empty' 2>/dev/null)
  DENY=false
  case "$MODE:$TOOL_NAME" in
    read-only:Write|read-only:Edit|read-only:NotebookEdit|read-only:Bash|no-shell:Bash|no-network:WebFetch|no-network:WebSearch)
      DENY=true ;;
  esac
  [[ "$DENY" == true ]] || exit 0
  REASON="Giám thị quarantine '$MODE' blocked tool '$TOOL_NAME'. A human must review and clear $QUARANTINE_FILE."
  jq -n --arg reason "$REASON" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 2
fi

LOCK_BODY=$(head -c 1500 "$LOCK_FILE" 2>/dev/null)
[[ -z "$LOCK_BODY" ]] && LOCK_BODY="(khoá tồn tại nhưng không đọc được nội dung)"

REASON="Giám thị đã khoá phiên này — chỉ con người mới gỡ được (xoá $LOCK_FILE sau khi đã kiểm tra). Nội dung: $LOCK_BODY"

jq -n --arg reason "$REASON" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $reason
  }
}'
exit 2

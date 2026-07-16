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
# KNOWN LIMITATION (2026-07-13, security-auditor + code-auditor review):
# resolves its own root via BASH_SOURCE rather than CLAUDE_PROJECT_DIR/pwd —
# deliberately, because this is the single most safety-critical hook in the
# array (first entry, .* matcher, sole job is enforcing the halt) and must
# fail CLOSED (find the lock even if cwd/env is wrong), not fail open by
# looking in the wrong place and finding nothing.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCK_FILE="$CLAUDE_DIR/state/GIAMTHI_HALT.lock"

[[ -f "$LOCK_FILE" ]] || exit 0

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

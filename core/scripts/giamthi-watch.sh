#!/usr/bin/env bash
# Yana AI — Giám thị (independent watcher)
# Status: active
# Description: Runs OUTSIDE any AI session, scheduled by launchd on macOS,
#   a systemd user timer on Linux, or Task Scheduler on Windows. The canonical
#   manager is `yana-ai giamthi`; persistent installation requires an explicit
#   installer confirmation or `yana-ai install --supervisor install`. Checks core-lock integrity,
#   audit-chain integrity, and recent changes to security-sensitive paths.
#   On any finding, writes .claude/state/GIAMTHI_HALT.lock (read by
#   the Claude/Codex hooks and Cursor bridge, which deny new supported host
#   events against this repo until a human removes the lock)
#   and a human-readable report, then sends a best-effort desktop
#   notification.
# Last Reviewed: 2026-07-18
#
# Design intent (per anh's instruction, 2026-07-13): observe, don't
# auto-block automation under normal conditions; the one power this script
# has is to halt + report when something looks wrong. It cannot un-halt
# itself, and it cannot run inside the session it watches — that separation
# is what makes it a real, independent check rather than the agent grading
# its own homework.
#
# Install and inspect:
#   yana-ai giamthi install .
#   yana-ai giamthi status .
#   yana-ai giamthi repair .
#   yana-ai giamthi uninstall .   # preserves HALT lock and audit evidence

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR" || exit 0

STATE_DIR="$REPO_DIR/.claude/state"
LOCK_FILE="$STATE_DIR/GIAMTHI_HALT.lock"
REPORT_LOG="$STATE_DIR/giamthi-reports.log"
HEARTBEAT_LOG="$STATE_DIR/giamthi-heartbeat.log"
LAST_SHA_FILE="$STATE_DIR/giamthi-last-commit"
SOURCE_CHECKOUT=0
[[ -f "$REPO_DIR/core/config/core-lock.json" ]] && SOURCE_CHECKOUT=1

mkdir -p "$STATE_DIR" 2>/dev/null || true

# Already halted — a human hasn't cleared it yet. Don't pile on more checks
# or move the comparison baseline forward while the lock is unresolved.
if [[ -f "$LOCK_FILE" ]]; then
  exit 0
fi

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ISSUES=()

# ── 1. Source-checkout core integrity ───────────────────────────────────────
# Applied projects intentionally do not contain Yana's source-only core/
# directory. Core-lock is therefore mandatory only when this is the Yana
# scaffold itself; treating its absence in every installed target as tampering
# would halt every normal PyPI/npm installation on its first scheduled run.
if [[ "$SOURCE_CHECKOUT" -eq 1 && ( -x core/scripts/verify-core-lock.sh || -f core/scripts/verify-core-lock.sh ) ]]; then
  CORELOCK_OUT=$(bash core/scripts/verify-core-lock.sh 2>&1)
  CORELOCK_EXIT=$?
  if [[ $CORELOCK_EXIT -ne 0 ]]; then
    ISSUES+=("core-lock verify FAILED (exit $CORELOCK_EXIT): ${CORELOCK_OUT:0:500}")
  fi
elif [[ "$SOURCE_CHECKOUT" -eq 1 ]]; then
  ISSUES+=("core/scripts/verify-core-lock.sh is missing — core integrity check cannot run.")
fi

# ── 2. Audit-chain integrity (tamper detection on .claude/state/audit-chain.log) ──
AUDIT_VERIFY="$REPO_DIR/core/scripts/verify-audit-chain.sh"
[[ -f "$AUDIT_VERIFY" ]] || AUDIT_VERIFY="$REPO_DIR/.claude/scripts/verify-audit-chain.sh"
if [[ -f "$AUDIT_VERIFY" ]]; then
  AUDITCHAIN_OUT=$(bash "$AUDIT_VERIFY" 2>&1)
  AUDITCHAIN_EXIT=$?
  if [[ $AUDITCHAIN_EXIT -ne 0 ]]; then
    ISSUES+=("audit-chain verify FAILED (exit $AUDITCHAIN_EXIT): ${AUDITCHAIN_OUT:0:500}")
  fi
else
  ISSUES+=("core/scripts/verify-audit-chain.sh is missing — audit-chain integrity check cannot run.")
fi

# ── 3. Cross-engine hook mirror integrity ───────────────────────────────────
if [[ "$SOURCE_CHECKOUT" -eq 1 && ( -x core/scripts/verify-hook-mirrors.sh || -f core/scripts/verify-hook-mirrors.sh ) ]]; then
  MIRROR_OUT=$(bash core/scripts/verify-hook-mirrors.sh 2>&1)
  MIRROR_EXIT=$?
  if [[ $MIRROR_EXIT -ne 0 ]]; then
    ISSUES+=("hook mirror verify FAILED (exit $MIRROR_EXIT): ${MIRROR_OUT:0:500}")
  fi
elif [[ "$SOURCE_CHECKOUT" -eq 1 ]]; then
  ISSUES+=("core/scripts/verify-hook-mirrors.sh is missing — Claude/Codex mirror integrity cannot be checked.")
elif [[ -f "$REPO_DIR/.claude/hooks/giamthi-halt-check.sh" && -d "$REPO_DIR/.codex/hooks" ]]; then
  if [[ ! -f "$REPO_DIR/.codex/hooks/giamthi-halt-check.sh" ]]; then
    ISSUES+=(".codex/hooks/giamthi-halt-check.sh is missing while Codex hooks are installed.")
  elif ! cmp -s "$REPO_DIR/.claude/hooks/giamthi-halt-check.sh" "$REPO_DIR/.codex/hooks/giamthi-halt-check.sh"; then
    ISSUES+=("Claude/Codex Giám thị halt hooks differ in the installed target.")
  fi
fi

# ── 4. Scope drift on security-sensitive paths NOT already covered by core-lock ──
# (.claude/settings.json, .claude/hooks/, .github/workflows/ live outside
# core-lock's LOCKED_DIRS, so drift there is otherwise invisible.)
#
# KNOWN LIMITATION (2026-07-13, code-auditor review): this diffs commit SHAs,
# not the working tree. An edit to a watched path made and never committed
# (or committed and reverted before the next cron tick) is invisible for the
# gap between ticks. core-lock's own content-hash approach doesn't have this
# gap for LOCKED_DIRS — this check exists only for the paths outside that.
#
# Any failure to actually RUN this check (git missing from cron's PATH, the
# recorded baseline commit no longer reachable after a rebase/prune) must be
# treated as an issue, not silently treated as "clean" — a check that didn't
# run is not the same as a check that passed.
LAST_SHA=$(cat "$LAST_SHA_FILE" 2>/dev/null || echo "")
CURRENT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")

if [[ -z "$CURRENT_SHA" ]]; then
  ISSUES+=("Không lấy được git HEAD hiện tại (git không có trên PATH của cron, hoặc $REPO_DIR không phải git repo) — scope-drift check KHÔNG chạy được, không được coi là sạch.")
elif [[ -n "$LAST_SHA" && "$LAST_SHA" != "$CURRENT_SHA" ]]; then
  CHANGED=$(git diff --name-only "$LAST_SHA" "$CURRENT_SHA" 2>/dev/null)
  DIFF_EXIT=$?
  if [[ $DIFF_EXIT -ne 0 ]]; then
    ISSUES+=("git diff giữa baseline cũ ($LAST_SHA) và hiện tại ($CURRENT_SHA) thất bại (exit $DIFF_EXIT) — baseline có thể đã bị rebase/prune khỏi history. Không coi là sạch.")
  else
    RISKY=$(printf '%s\n' "$CHANGED" | grep -E '^(\.claude/settings\.json|\.claude/hooks/|\.codex/hooks|\.cursor/hooks|\.github/workflows/)' || true)
    if [[ -n "$RISKY" ]]; then
      ISSUES+=("Thay đổi ở vùng nhạy cảm ngoài phạm vi core-lock, từ $LAST_SHA đến $CURRENT_SHA: $(printf '%s' "$RISKY" | tr '\n' ' ')")
    fi
  fi
fi

# ── Report + halt, or clean heartbeat ──────────────────────────────────────
if [[ ${#ISSUES[@]} -gt 0 ]]; then
  {
    echo "=== GIAM THI HALT — $TS ==="
    printf '%s\n' "${ISSUES[@]}"
    echo
    echo "Gỡ khoá: xoá $LOCK_FILE sau khi đã kiểm tra thủ công. Không có cơ chế tự động gỡ."
  } > "$LOCK_FILE"

  {
    echo "=== $TS ==="
    printf '%s\n' "${ISSUES[@]}"
    echo
  } >> "$REPORT_LOG"

  FIRST_ISSUE="${ISSUES[0]:0:180}"
  if command -v terminal-notifier >/dev/null 2>&1; then
    # Preferred: terminal-notifier is a real bundled app, so clicking the
    # notification just dismisses it — no blank Script Editor window.
    # `osascript -e 'display notification'` has no app identity of its own;
    # macOS attributes the click to Script Editor and opens it empty, which
    # reads as "the notification has nothing behind it" (real bug report,
    # 2026-07-17). Fall back to osascript only when terminal-notifier isn't
    # installed — same content, same best-effort/non-fatal behavior.
    terminal-notifier -title "Giám thị Yana AI — HALT" -message "$FIRST_ISSUE" >/dev/null 2>&1 || true
  elif command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"${FIRST_ISSUE}\" with title \"Giám thị Yana AI — HALT\"" >/dev/null 2>&1 || true
  fi
else
  # Only ever persist a non-empty baseline — writing "" here would silently
  # disable this check on every future run until someone notices by hand.
  if [[ -n "$CURRENT_SHA" ]]; then
    echo "$CURRENT_SHA" > "$LAST_SHA_FILE" 2>/dev/null || true
  fi
  echo "[$TS] OK — core-lock, audit-chain, scope đều sạch" >> "$HEARTBEAT_LOG"
fi

exit 0

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
BASELINE_RECEIPTS="$STATE_DIR/giamthi-baseline-receipts.log"
SENSITIVE_PATHS=(
  ".claude/settings.json"
  ".claude/hooks"
  ".codex/hooks"
  ".cursor/hooks.json"
  ".cursor/hooks"
  ".github/workflows"
)
SOURCE_CHECKOUT=0
[[ -f "$REPO_DIR/core/config/core-lock.json" ]] && SOURCE_CHECKOUT=1

mkdir -p "$STATE_DIR" 2>/dev/null || true

approve_baseline() {
  local actor="" reason="" approved=false current dirty ts
  shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --actor) actor="${2:-}"; shift 2 ;;
      --reason) reason="${2:-}"; shift 2 ;;
      --approve) approved=true; shift ;;
      *) echo "Unknown baseline approval argument: $1" >&2; return 2 ;;
    esac
  done
  if [[ "$approved" != true || -z "$actor" || -z "$reason" ]]; then
    echo "Baseline approval requires --approve, --actor, and --reason." >&2
    return 2
  fi
  current=$(git rev-parse HEAD 2>/dev/null || true)
  [[ -n "$current" ]] || { echo "Cannot approve baseline without a readable git HEAD." >&2; return 2; }
  dirty=$(git status --porcelain=v1 --untracked-files=all -- "${SENSITIVE_PATHS[@]}" 2>/dev/null)
  [[ -z "$dirty" ]] || {
    echo "Refusing baseline approval while security-sensitive paths are uncommitted:" >&2
    printf '%s\n' "$dirty" >&2
    return 2
  }
  for path in "$BASELINE_RECEIPTS"; do
    if [[ -L "$path" || ( -e "$path" && ! -f "$path" ) ]]; then
      echo "Refusing non-regular baseline evidence: $path" >&2
      return 2
    fi
  done
  write_baseline_sha "$current" || return 2
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  actor=${actor//$'\n'/ }
  reason=${reason//$'\n'/ }
  printf '%s\tsha=%s\tactor=%s\treason=%s\n' "$ts" "$current" "$actor" "$reason" >> "$BASELINE_RECEIPTS"
  echo "Approved Giám Thị security baseline $current. HALT, if present, was not cleared."
}

write_baseline_sha() {
  local sha="$1" temporary="$LAST_SHA_FILE.tmp.$$"
  if [[ -L "$LAST_SHA_FILE" || ( -e "$LAST_SHA_FILE" && ! -f "$LAST_SHA_FILE" ) ]]; then
    echo "Refusing non-regular baseline evidence: $LAST_SHA_FILE" >&2
    return 2
  fi
  umask 077
  printf '%s\n' "$sha" > "$temporary" || return 2
  mv "$temporary" "$LAST_SHA_FILE" || return 2
}

if [[ "${1:-}" == "--approve-baseline" ]]; then
  approve_baseline "$@"
  exit $?
fi

# Already halted — a human hasn't cleared it yet. Don't pile on more checks
# or move the comparison baseline forward while the lock is unresolved.
if [[ -e "$LOCK_FILE" || -L "$LOCK_FILE" ]]; then
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
# Any failure to actually RUN this check (git missing from cron's PATH, the
# recorded baseline commit no longer reachable after a rebase/prune) must be
# treated as an issue, not silently treated as "clean" — a check that didn't
# run is not the same as a check that passed.
if [[ -L "$LAST_SHA_FILE" || ( -e "$LAST_SHA_FILE" && ! -f "$LAST_SHA_FILE" ) ]]; then
  ISSUES+=("Giám Thị baseline evidence is non-regular or symlinked: $LAST_SHA_FILE")
  LAST_SHA=""
else
  LAST_SHA=$(cat "$LAST_SHA_FILE" 2>/dev/null || echo "")
fi
CURRENT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")

if [[ -z "$CURRENT_SHA" ]]; then
  ISSUES+=("Không lấy được git HEAD hiện tại (git không có trên PATH của cron, hoặc $REPO_DIR không phải git repo) — scope-drift check KHÔNG chạy được, không được coi là sạch.")
else
  WORKTREE_STATE=$(git status --porcelain=v1 --untracked-files=all -- "${SENSITIVE_PATHS[@]}" 2>&1)
  WORKTREE_EXIT=$?
  if [[ $WORKTREE_EXIT -ne 0 ]]; then
    ISSUES+=("git status cho vùng nhạy cảm thất bại (exit $WORKTREE_EXIT) — working-tree drift check KHÔNG chạy được: ${WORKTREE_STATE:0:500}")
  elif [[ -n "$WORKTREE_STATE" ]]; then
    ISSUES+=("Có thay đổi CHƯA COMMIT trong vùng nhạy cảm (modified/added/deleted/type-changed): ${WORKTREE_STATE:0:1000}")
  fi
fi

if [[ -n "$CURRENT_SHA" && -n "$LAST_SHA" && "$LAST_SHA" != "$CURRENT_SHA" ]]; then
  CHANGED=$(git diff --name-only "$LAST_SHA" "$CURRENT_SHA" 2>/dev/null)
  DIFF_EXIT=$?
  if [[ $DIFF_EXIT -ne 0 ]]; then
    ISSUES+=("git diff giữa baseline cũ ($LAST_SHA) và hiện tại ($CURRENT_SHA) thất bại (exit $DIFF_EXIT) — baseline có thể đã bị rebase/prune khỏi history. Không coi là sạch.")
  else
    RISKY=$(printf '%s\n' "$CHANGED" | grep -E '^(\.claude/settings\.json|\.claude/hooks/|\.codex/hooks/|\.cursor/hooks\.json|\.cursor/hooks/|\.github/workflows/)' || true)
    if [[ -n "$RISKY" ]]; then
      ISSUES+=("Thay đổi đã commit ở vùng nhạy cảm từ $LAST_SHA đến $CURRENT_SHA chưa được con người duyệt: $(printf '%s' "$RISKY" | tr '\n' ' '). Sau khi review, chạy: bash .claude/scripts/giamthi-watch.sh --approve-baseline --approve --actor <name> --reason <reason>; lệnh này KHÔNG gỡ HALT.")
    fi
  fi
fi

# Bootstrap once for a newly installed watcher. This is initialization, not
# advancement: every later SHA change requires the explicit approval ceremony.
if [[ ${#ISSUES[@]} -eq 0 && -n "$CURRENT_SHA" && -z "$LAST_SHA" ]]; then
  write_baseline_sha "$CURRENT_SHA" || ISSUES+=("Không thể khởi tạo Giám Thị security baseline an toàn.")
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
  echo "[$TS] OK — core-lock, audit-chain, scope đều sạch" >> "$HEARTBEAT_LOG"
fi

exit 0

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

# Trusted-home mode (added 2026-10-14). An installed project carries a full
# copy of this script under .claude/scripts/, inside a tree the agent being
# watched can write to; deriving the target from the script's own location
# would let that copy be replaced with `exit 0` and silently disable the
# watcher. When the supervisor runs a copy kept outside the project
# (~/.yana/pack/...), it names the project through YANA_WATCH_TARGET instead.
# The value must be an absolute path to a real directory: no symlink, and no
# symlinked path component (checked by comparing the physical path). Without
# the variable the old behaviour is unchanged.
TRUSTED_HOME=0
if [[ -n "${YANA_WATCH_TARGET:-}" ]]; then
  WATCH_TARGET="${YANA_WATCH_TARGET%/}"
  case "$WATCH_TARGET" in
    /* | [A-Za-z]:[\\/]*) ;;
    *) echo "Giám Thị: YANA_WATCH_TARGET must be an absolute path: $YANA_WATCH_TARGET" >&2; exit 2 ;;
  esac
  if [[ -L "$WATCH_TARGET" || ! -d "$WATCH_TARGET" ]]; then
    echo "Giám Thị: YANA_WATCH_TARGET must be a real directory, not a symlink: $YANA_WATCH_TARGET" >&2
    exit 2
  fi
  REPO_DIR="$(cd -P "$WATCH_TARGET" 2>/dev/null && pwd -P)" || {
    echo "Giám Thị: cannot enter YANA_WATCH_TARGET: $YANA_WATCH_TARGET" >&2
    exit 2
  }
  # Git Bash/MSYS/Cygwin rewrite Windows paths, so the physical-path
  # comparison only means something on a real POSIX shell.
  case "$(uname -s 2>/dev/null)" in
    MINGW* | MSYS* | CYGWIN*) ;;
    *)
      if [[ "$REPO_DIR" != "$WATCH_TARGET" ]]; then
        echo "Giám Thị: YANA_WATCH_TARGET contains a symlinked component: $YANA_WATCH_TARGET -> $REPO_DIR" >&2
        exit 2
      fi
      ;;
  esac
  TRUSTED_HOME=1
else
  REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi
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
  # Added 2026-10-14: installed projects keep a full copy of this watcher and
  # its audit-chain verifier here, so a change to them is a change to the
  # watcher itself.
  ".claude/scripts"
  # Added 2026-09-16 (targeted core hardening review, item 3): core-lock's
  # own LOCKED_DIRS were NOT covered by this watcher's human-approval
  # ceremony, even though the check_corelock() call below only proves
  # self-consistency (core-lock.json matches whatever is currently on
  # disk) -- an actor that modifies one of these dirs AND regenerates
  # core-lock.json in the same session would pass verify-core-lock.sh
  # cleanly, with nothing independent catching it. This closes that gap
  # by giving these paths the same out-of-session, human-approval-gated
  # scope-drift check .claude/hooks etc. already had. Keep in sync with
  # core/scripts/update-core-lock.sh's own LOCKED_DIRS.
  "core/rules"
  "core/gates"
  "core/hooks"
  "core/scripts"
  "src/guard"
)

# Every git call goes through git_safe. The project's own .git is writable by
# the agent being watched, so nothing in it may decide what this watcher sees
# or run code inside it (security review, 2026-10-14):
#   core.fsmonitor / core.hooksPath  run programs, and fsmonitor can report
#                                    "nothing changed"
#   filter.<x>.clean/smudge/process  run programs on `git status`, and a clean
#                                    filter can print the original content for
#                                    an edited file
#   core.fileMode=false              hides chmod +x on a dormant script
#   refs/replace                     rewrites history the baseline compares to
# GIT_* variables that redirect the repository are dropped for the same reason.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY \
  GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM \
  GIT_CONFIG_COUNT GIT_CONFIG_PARAMETERS GIT_EXTERNAL_DIFF GIT_PAGER GIT_EXEC_PATH \
  GIT_REPLACE_REF_BASE GIT_NO_REPLACE_OBJECTS GIT_COMMON_DIR GIT_NAMESPACE \
  GIT_CEILING_DIRECTORIES GIT_ATTR_SOURCE
for _git_var in "${!GIT_CONFIG_KEY_@}" "${!GIT_CONFIG_VALUE_@}"; do unset "$_git_var"; done
export GIT_CONFIG_NOSYSTEM=1

# Neutralise every configured content filter by name. With the filter off, git
# compares the raw file, so a tampered file shows as modified instead of
# being laundered back to its committed bytes.
# Forcing core.fileMode=true exposes `chmod +x` on a dormant script, but on
# NTFS/FAT (Git for Windows) the exec bit does not exist, so forcing it would
# HALT every executable forever. Skip the override there.
GIT_MODE_ARGS=(-c core.fileMode=true)
case "$(uname -s 2>/dev/null)" in
  MINGW* | MSYS* | CYGWIN*) GIT_MODE_ARGS=() ;;
esac

# Re-read on every call: the list is only as fresh as the moment it is taken.
# (Still point-in-time; hashing with --no-filters would remove the race.)
GIT_HARDEN_ARGS=()
refresh_git_filters() {
  local key
  GIT_HARDEN_ARGS=()
  while IFS= read -r key; do
    case "$key" in
      filter.*.clean | filter.*.smudge | filter.*.process) GIT_HARDEN_ARGS+=(-c "$key=") ;;
      filter.*.required) GIT_HARDEN_ARGS+=(-c "$key=false") ;;
    esac
  done < <(git config --get-regexp '^filter\.' 2>/dev/null | cut -d' ' -f1)
}

git_safe() {
  refresh_git_filters
  git --no-replace-objects --no-optional-locks \
    -c core.fsmonitor=false -c core.hooksPath=/dev/null ${GIT_MODE_ARGS[@]+"${GIT_MODE_ARGS[@]}"} \
    -c core.ignoreStat=false -c core.untrackedCache=false -c diff.ignoreSubmodules=none \
    ${GIT_HARDEN_ARGS[@]+"${GIT_HARDEN_ARGS[@]}"} "$@"
}

# Append to a state file only if it is absent or a regular file. A symlink
# planted by the watched agent would otherwise turn this write into an
# append to any file the user can write (~/.zshrc, a LaunchAgent plist...).
safe_append() {
  local file="$1"
  if [[ -L "$file" || ( -e "$file" && ! -f "$file" ) ]]; then
    echo "Giám Thị: refusing to write through non-regular state file: $file" >&2
    return 1
  fi
  cat >> "$file" 2>/dev/null
}

# Replace a state file atomically. rename() replaces a symlink itself instead
# of writing through it; set -C makes the temp file fail if it was pre-planted.
safe_replace() {
  local file="$1" content="$2" temporary="$1.tmp.$$"
  if [[ -L "$file" || ( -e "$file" && ! -f "$file" ) ]]; then
    rm -f "$file" 2>/dev/null || return 1
  fi
  rm -f "$temporary" 2>/dev/null
  ( set -C; printf '%s\n' "$content" > "$temporary" ) 2>/dev/null || return 1
  mv -f "$temporary" "$file" 2>/dev/null || { rm -f "$temporary" 2>/dev/null; return 1; }
}

# Notify at most once per cooldown for the same signature. The throttle file
# lives wherever the caller says: the state dir normally, a temp file when the
# state dir itself is the problem (so that failure cannot repeat every run).
notify_once() {
  local sig="$1" message="$2" throttle="$3" now previous_sig="" previous_at=""
  now=$(date +%s)
  if [[ -f "$throttle" && ! -L "$throttle" ]]; then
    read -r previous_sig previous_at < "$throttle" || true
    # A future-dated stamp is forged or from a clock jump: treat as expired.
    if [[ "$previous_sig" == "$sig" && "$previous_at" =~ ^[0-9]+$ ]] \
      && (( 10#$previous_at <= now && now - 10#$previous_at < NOTIFY_COOLDOWN_SECONDS )); then
      return 0
    fi
  fi
  safe_replace "$throttle" "$sig $now" || true
  notify_desktop "$message"
}

# Best-effort desktop notification. The text comes from git/verifier output, so
# it is neutralised before it reaches AppleScript. Naming the report path is
# deliberate: a notification that only says "HALT" and opens nothing is what
# users reported as spam they could not act on.
notify_desktop() {
  local note="$1"
  note="${note//$'\n'/ }"
  if command -v terminal-notifier >/dev/null 2>&1; then
    # Preferred: terminal-notifier is a real bundled app, and -open makes a
    # click show the report. `osascript -e 'display notification'` has no app
    # identity of its own; macOS attributes the click to Script Editor and
    # opens it empty (real bug report, 2026-07-17).
    terminal-notifier -title "Giám thị Yana AI — HALT" -message "$note" \
      -open "file://${LOCK_FILE// /%20}" >/dev/null 2>&1 || true
  elif command -v osascript >/dev/null 2>&1; then
    note="${note//\\/ }"
    note="${note//\"/\'}"
    osascript -e "display notification \"${note}\" with title \"Giám thị Yana AI — HALT\"" >/dev/null 2>&1 || true
  fi
}

# Same findings re-notify at most once per day (see the notification block).
NOTIFY_COOLDOWN_SECONDS=86400

SOURCE_CHECKOUT=0
[[ -f "$REPO_DIR/core/config/core-lock.json" ]] && SOURCE_CHECKOUT=1
# A source checkout that had its lock file deleted is still a source checkout:
# trust what HEAD says, not only what is on disk.
if [[ "$SOURCE_CHECKOUT" -eq 0 ]] && git_safe cat-file -e HEAD:core/config/core-lock.json 2>/dev/null; then
  SOURCE_CHECKOUT=1
fi

mkdir -p "$STATE_DIR" 2>/dev/null || true
# HALT is written into this directory. If it cannot hold files, the watcher
# could not stop anything, so fail loudly (non-zero) instead of reporting OK.
if [[ ! -d "$STATE_DIR" || -L "$STATE_DIR" ]]; then
  echo "Giám Thị: state directory is not usable, cannot record HALT: $STATE_DIR" >&2
  notify_once "state-dir" "Giám Thị không ghi được trạng thái: $STATE_DIR (không phải thư mục thật). Watcher không thể HALT." \
    "${TMPDIR:-/tmp}/giamthi-notify-$(printf '%s' "$REPO_DIR" | cksum | cut -d' ' -f1)"
  exit 3
fi

approve_baseline() {
  local actor="" reason="" approved=false current dirty dirty_exit ts
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
  current=$(git_safe rev-parse HEAD 2>/dev/null || true)
  [[ -n "$current" ]] || { echo "Cannot approve baseline without a readable git HEAD." >&2; return 2; }
  dirty=$(git_safe status --porcelain=v1 --untracked-files=all --ignore-submodules=none -- "${SENSITIVE_PATHS[@]}" 2>/dev/null)
  dirty_exit=$?
  # An empty result from a failed `git status` (corrupted index) is not "clean".
  [[ "$dirty_exit" -eq 0 ]] || {
    echo "Cannot verify the sensitive paths are clean: git status failed (exit $dirty_exit)." >&2
    return 2
  }
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
  rm -f "$temporary" 2>/dev/null
  ( set -C; printf '%s\n' "$sha" > "$temporary" ) || return 2
  mv -f "$temporary" "$LAST_SHA_FILE" || { rm -f "$temporary" 2>/dev/null; return 2; }
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
CORELOCK_VERIFY="core/scripts/verify-core-lock.sh"
MIRROR_VERIFY="core/scripts/verify-hook-mirrors.sh"
if [[ "$TRUSTED_HOME" -eq 1 ]]; then
  # Same reasoning as the audit verifier: never run the project's copy.
  CORELOCK_VERIFY="$SCRIPT_DIR/verify-core-lock.sh"
  MIRROR_VERIFY="$SCRIPT_DIR/verify-hook-mirrors.sh"
fi
# A symlink never counts as the verifier, in either mode.
if [[ "$SOURCE_CHECKOUT" -eq 1 && -f "$CORELOCK_VERIFY" && ! -L "$CORELOCK_VERIFY" ]]; then
  CORELOCK_OUT=$(CLAUDE_PROJECT_DIR="$REPO_DIR" bash "$CORELOCK_VERIFY" 2>&1)
  CORELOCK_EXIT=$?
  if [[ $CORELOCK_EXIT -ne 0 ]]; then
    ISSUES+=("core-lock verify FAILED (exit $CORELOCK_EXIT): ${CORELOCK_OUT:0:500}")
  fi
elif [[ "$SOURCE_CHECKOUT" -eq 1 ]]; then
  ISSUES+=("${CORELOCK_VERIFY} is missing — core integrity check cannot run (verify-core-lock.sh).")
fi

# ── 2. Audit-chain integrity (tamper detection on .claude/state/audit-chain.log) ──
if [[ "$TRUSTED_HOME" -eq 1 ]]; then
  # Only the verifier shipped next to this script. Falling back to the
  # project's copy would hand the check back to the tree being watched.
  AUDIT_VERIFY="$SCRIPT_DIR/verify-audit-chain.sh"
  [[ -f "$AUDIT_VERIFY" && ! -L "$AUDIT_VERIFY" ]] || AUDIT_VERIFY=""
else
  AUDIT_VERIFY="$REPO_DIR/core/scripts/verify-audit-chain.sh"
  [[ -f "$AUDIT_VERIFY" ]] || AUDIT_VERIFY="$REPO_DIR/.claude/scripts/verify-audit-chain.sh"
fi
if [[ -n "$AUDIT_VERIFY" && -f "$AUDIT_VERIFY" ]]; then
  AUDITCHAIN_OUT=$(CLAUDE_PROJECT_DIR="$REPO_DIR" bash "$AUDIT_VERIFY" 2>&1)
  AUDITCHAIN_EXIT=$?
  if [[ $AUDITCHAIN_EXIT -ne 0 ]]; then
    ISSUES+=("audit-chain verify FAILED (exit $AUDITCHAIN_EXIT): ${AUDITCHAIN_OUT:0:500}")
  fi
else
  ISSUES+=("core/scripts/verify-audit-chain.sh is missing — audit-chain integrity check cannot run.")
fi

# ── 3. Cross-engine hook mirror integrity ───────────────────────────────────
if [[ "$SOURCE_CHECKOUT" -eq 1 && -f "$MIRROR_VERIFY" && ! -L "$MIRROR_VERIFY" ]]; then
  MIRROR_OUT=$(CLAUDE_PROJECT_DIR="$REPO_DIR" bash "$MIRROR_VERIFY" 2>&1)
  MIRROR_EXIT=$?
  if [[ $MIRROR_EXIT -ne 0 ]]; then
    ISSUES+=("hook mirror verify FAILED (exit $MIRROR_EXIT): ${MIRROR_OUT:0:500}")
  fi
elif [[ "$SOURCE_CHECKOUT" -eq 1 ]]; then
  ISSUES+=("${MIRROR_VERIFY} is missing — Claude/Codex mirror integrity cannot be checked (verify-hook-mirrors.sh).")
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
CURRENT_SHA=$(git_safe rev-parse HEAD 2>/dev/null || echo "")

if [[ -z "$CURRENT_SHA" ]]; then
  ISSUES+=("Không lấy được git HEAD hiện tại (git không có trên PATH của cron, hoặc $REPO_DIR không phải git repo) — scope-drift check KHÔNG chạy được, không được coi là sạch.")
else
  WORKTREE_STATE=$(git_safe status --porcelain=v1 --untracked-files=all --ignore-submodules=none -- "${SENSITIVE_PATHS[@]}" 2>&1)
  WORKTREE_EXIT=$?
  if [[ $WORKTREE_EXIT -ne 0 ]]; then
    ISSUES+=("git status cho vùng nhạy cảm thất bại (exit $WORKTREE_EXIT) — working-tree drift check KHÔNG chạy được: ${WORKTREE_STATE:0:500}")
  elif [[ -n "$WORKTREE_STATE" ]]; then
    ISSUES+=("Có thay đổi CHƯA COMMIT trong vùng nhạy cảm (modified/added/deleted/type-changed): ${WORKTREE_STATE:0:1000}")
  fi
fi

# `git status` trusts the index flags and ignore rules, both agent-writable.
# skip-worktree / assume-unchanged make a modified tracked file look clean, and
# an ignore rule hides a new file. Either one in a sensitive path is itself a
# finding (ls-files -v tags those entries with a lowercase letter or S).
#
# KNOWN HOLE (security review round 3, 2026-10-14, left open on purpose):
# files under __pycache__/ are exempt because Python writes them while the
# sources in these directories run, and this checkout alone has dozens. A
# hand-built .pyc there (valid header, evil code) is imported as if it were the
# source and this watcher cannot see it. Closing it needs either bytecode off
# for the watched code (PYTHONDONTWRITEBYTECODE=1) or a pyc-vs-source check.
if [[ -n "$CURRENT_SHA" ]]; then
  HIDDEN_TRACKED=$(git_safe ls-files -v -- "${SENSITIVE_PATHS[@]}" 2>/dev/null | grep -E '^[a-zS] ' || true)
  [[ -z "$HIDDEN_TRACKED" ]] || ISSUES+=("Có file trong vùng nhạy cảm bị ẩn khỏi git status (skip-worktree/assume-unchanged): ${HIDDEN_TRACKED:0:500}")
  HIDDEN_IGNORED=$(git_safe ls-files --others --ignored --exclude-standard -- "${SENSITIVE_PATHS[@]}" 2>/dev/null \
    | grep -vE '(^|/)__pycache__/|(^|/)\.claude/state/|(^|/)\.DS_Store$' || true)
  [[ -z "$HIDDEN_IGNORED" ]] || ISSUES+=("Có file trong vùng nhạy cảm bị .gitignore/exclude che khỏi git status: ${HIDDEN_IGNORED:0:500}")
fi

if [[ -n "$CURRENT_SHA" && -n "$LAST_SHA" && "$LAST_SHA" != "$CURRENT_SHA" ]]; then
  CHANGED=$(git_safe diff --name-only "$LAST_SHA" "$CURRENT_SHA" 2>/dev/null)
  DIFF_EXIT=$?
  if [[ $DIFF_EXIT -ne 0 ]]; then
    ISSUES+=("git diff giữa baseline cũ ($LAST_SHA) và hiện tại ($CURRENT_SHA) thất bại (exit $DIFF_EXIT) — baseline có thể đã bị rebase/prune khỏi history. Không coi là sạch.")
  else
    # In trusted mode the approval must also run the trusted copy; the
    # project's own copy is the one the watched agent can edit.
    APPROVE_CMD="bash .claude/scripts/giamthi-watch.sh"
    [[ "$TRUSTED_HOME" -eq 1 ]] && APPROVE_CMD="YANA_WATCH_TARGET=$(printf '%q' "$REPO_DIR") bash $(printf '%q' "$SCRIPT_DIR/giamthi-watch.sh")"
    RISKY=$(printf '%s\n' "$CHANGED" | grep -E '^(\.claude/settings\.json|\.claude/hooks/|\.claude/scripts/|\.codex/hooks/|\.cursor/hooks\.json|\.cursor/hooks/|\.github/workflows/|core/rules/|core/gates/|core/hooks/|core/scripts/|src/guard/)' || true)
    if [[ -n "$RISKY" ]]; then
      ISSUES+=("Thay đổi đã commit ở vùng nhạy cảm từ $LAST_SHA đến $CURRENT_SHA chưa được con người duyệt: $(printf '%s' "$RISKY" | tr '\n' ' '). Sau khi review, chạy: ${APPROVE_CMD} --approve-baseline --approve --actor <name> --reason <reason>; lệnh này KHÔNG gỡ HALT.")
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
  # A simple command, not a { } group: bash skips a whole group (and the
  # `if !` around it) when the group's redirection fails, which would let a
  # failed lock write fall through as if it had succeeded.
  ISSUE_LINES=$(printf '%s\n' "${ISSUES[@]}")
  if ! printf '=== GIAM THI HALT — %s ===\n%s\n\nGỡ khoá: xoá %s sau khi đã kiểm tra thủ công. Không có cơ chế tự động gỡ.\n' \
    "$TS" "$ISSUE_LINES" "$LOCK_FILE" 2>/dev/null > "$LOCK_FILE"; then
    echo "Giám Thị: findings detected but HALT lock could not be written ($LOCK_FILE):" >&2
    printf '%s\n' "${ISSUES[@]}" >&2
    notify_once "lock-write" "Giám Thị phát hiện lỗi nhưng không ghi được HALT: ${ISSUES[0]:0:120}" \
      "${TMPDIR:-/tmp}/giamthi-notify-$(printf '%s' "$REPO_DIR" | cksum | cut -d' ' -f1)"
    exit 3
  fi

  { printf '=== %s ===\n%s\n\n' "$TS" "$ISSUE_LINES"; } | safe_append "$REPORT_LOG" || true

  # Notify only when the findings changed, or the same findings have been
  # showing for longer than the cooldown. Without this, every time a human
  # clears the lock without fixing the cause, the next scheduled run re-fires
  # the same notification (73 HALTs in two weeks on one machine, 2026-10).
  ISSUE_SIG=$(printf '%s' "$ISSUE_LINES" | cksum | cut -d' ' -f1)
  notify_once "$ISSUE_SIG" "${ISSUES[0]:0:150} | Chi tiết: $LOCK_FILE" "$STATE_DIR/giamthi-last-notified"
else
  echo "[$TS] OK — core-lock, audit-chain, scope đều sạch" | safe_append "$HEARTBEAT_LOG" || true
fi

exit 0

#!/usr/bin/env bash
# budget-sentinel.sh — PostToolUse: theo dõi token budget, cảnh báo theo %
# Chạy song song sau mỗi tool call. Không block, không can thiệp vào workflow.
# Ngưỡng: 50% info · 80% warn · 90% single-agent mode · 95% critical

set -euo pipefail

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/state"
STATE_FILE="$STATE_DIR/sentinel.json"
mkdir -p "$STATE_DIR"

# ── Đọc token info từ Claude Code env hoặc estimate ─────────────────────────
TOKENS_REMAINING="${CLAUDE_CONTEXT_TOKENS_REMAINING:-0}"
TOKENS_USED="${CLAUDE_CONTEXT_TOKENS_USED:-0}"
SESSION_MAX="${CLAUDE_CONTEXT_WINDOW:-200000}"

# Fallback: estimate từ tool call counter nếu không có native token info
if [[ "$TOKENS_REMAINING" == "0" && "$TOKENS_USED" == "0" ]]; then
  # Đọc/update counter
  if [[ -f "$STATE_FILE" ]]; then
    COUNT=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('tool_calls',0))" 2>/dev/null || echo "0")
  else
    COUNT=0
  fi
  COUNT=$((COUNT + 1))
  python3 -c "
import json, os
path = '$STATE_FILE'
d = {}
if os.path.exists(path):
    try: d = json.load(open(path))
    except: d = {}
d['tool_calls'] = $COUNT
d['updated'] = '$(date -u +"%Y-%m-%dT%H:%M:%SZ")'
# Atomic write (temp + os.replace) — this hook is PostToolUse (fires on
# every tool call), so concurrent instances of ITSELF can race on this
# same sentinel.json; a plain open(path,'w') truncates before writing,
# which a concurrent reader/writer could observe mid-truncation.
_tmp = path + '.tmp.' + str(os.getpid())
json.dump(d, open(_tmp, 'w'))
os.replace(_tmp, path)
" 2>/dev/null

  # Estimate: avg ~2000 tokens per tool call, 200k session limit
  TOKENS_USED=$((COUNT * 2000))
  TOKENS_REMAINING=$((SESSION_MAX - TOKENS_USED))
  [[ $TOKENS_REMAINING -lt 0 ]] && TOKENS_REMAINING=0
fi

# ── Cập nhật total_tokens_used trong token-budget.json ──────────────────────
# token-budget.json (written by token-budget-guard.sh / src/guard/token_budget.rs,
# a PreToolUse hook) has always initialized total_tokens_used to 0 and never
# written a nonzero value afterward — every reader of that field
# (session-checkpoint.sh, core/mcp/yana-ai-mcp-server.js, and
# token_budget.rs's own BUDGET WARNING check) has always seen a permanent 0.
# This is the one hook in the chain that already has a real-or-estimated
# running token count (TOKENS_USED above) on every PostToolUse call, so it
# is the natural place to keep that shared field live. Read-modify-write,
# not overwrite: token-budget-guard.sh owns loop_attempts/fast_tier_* on the
# same file and must not have those clobbered by this hook.
# ADR-008: found during code review of the other token-budget.json writers
# — this hook was a 6th unlocked read-modify-write site on the same file
# token-budget-guard.sh/risk-scorer.sh/src/guard/token_budget.rs write,
# missed by both the original security audit's site count and ADR-008's
# own migration-target table. Same lock-name derivation (from the file
# path) as every other writer of this file, so this one now actually
# contends for the same lock instead of racing them.
export YANA_TOKEN_BUDGET_FILE="${YANA_TOKEN_BUDGET:-${CLAUDE_PROJECT_DIR:-.}/core/memory/L2_session/token-budget.json}"
export YANA_TOKENS_USED_NOW="$TOKENS_USED"
export YANA_SENTINEL_LOG_FILE="${YANA_LOG:-/tmp/yana-ai-audit.log}"
python3 -c "
import json, os, sys
from datetime import datetime, timezone

sys.path.insert(0, os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd()))
from core.lib.py.file_lock import FileLock, LockTimeoutError

# Path and token count come in via env, not string-interpolated into this
# script — YANA_TOKEN_BUDGET is an externally-settable env var and must
# never be spliced directly into a Python source string (injection risk;
# see core/rules/shell-sanitize-law.md and env-integrity-policy.md).
path = os.environ['YANA_TOKEN_BUDGET_FILE']
tokens_used = int(os.environ['YANA_TOKENS_USED_NOW'])

# core/hooks/CLAUDE.md: 'Hooks must fail loudly or warn loudly.' A bare
# 'except: pass' would silently drop total_tokens_used updates on lock
# contention with zero trace — log to YANA_LOG instead (not stderr, which
# this call already redirects to /dev/null below).
def _warn(msg):
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    try:
        with open(os.environ['YANA_SENTINEL_LOG_FILE'], 'a') as f:
            f.write(f'[{ts}] budget-sentinel: {msg}\n')
    except Exception:
        pass  # logging itself is best-effort — must never crash the hook

try:
    with FileLock(path, timeout=5.0):
        d = {}
        if os.path.exists(path):
            try: d = json.load(open(path))
            except Exception: d = {}
        if not isinstance(d, dict):
            d = {}
        d.setdefault('session_start', datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))
        d.setdefault('actions', [])
        d.setdefault('loop_attempts', {})
        d.setdefault('fast_tier_triggered', False)
        d['total_tokens_used'] = tokens_used
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        # Atomic write — an unlocked reader (core/scripts/session-checkpoint.sh
        # reads this same file without taking this lock) must never observe
        # a torn/truncated write, even though it's protected against other
        # LOCKED writers by FileLock above.
        _tmp_path = f'{path}.tmp.{os.getpid()}'
        json.dump(d, open(_tmp_path, 'w'), indent=2)
        os.replace(_tmp_path, path)
except LockTimeoutError:
    # non-fatal — this hook's own PostToolUse warning logic below does not
    # depend on this write succeeding — but a timeout means
    # total_tokens_used silently went stale, worth knowing.
    _warn(f'lock timeout writing total_tokens_used to {path}')
except Exception as e:
    _warn(f'failed to write total_tokens_used: {e}')
" 2>/dev/null || true

# ── Tính phần trăm ───────────────────────────────────────────────────────────
TOTAL=$((TOKENS_USED + TOKENS_REMAINING))
[[ $TOTAL -eq 0 ]] && exit 0

PCT_USED=$(( (TOKENS_USED * 100) / TOTAL ))
PCT_LEFT=$(( 100 - PCT_USED ))

# ── Ngưỡng cảnh báo ─────────────────────────────────────────────────────────
MSG=""
LEVEL=""

if [[ $PCT_LEFT -le 5 ]]; then
  LEVEL="CRITICAL"
  MSG="⛔ BUDGET SENTINEL — Còn ${PCT_LEFT}% | Phải new session ngay. Single-agent mode bắt buộc."
elif [[ $PCT_LEFT -le 10 ]]; then
  LEVEL="CRITICAL"
  MSG="🔴 BUDGET SENTINEL — Còn ${PCT_LEFT}% | Chuyển single-agent mode. Wrap up session."
elif [[ $PCT_LEFT -le 20 ]]; then
  LEVEL="WARN"
  MSG="🟠 BUDGET SENTINEL — Còn ${PCT_LEFT}% | Nên wrap up sớm hoặc chuyển session mới."
elif [[ $PCT_LEFT -le 50 ]]; then
  LEVEL="INFO"
  MSG="🟡 BUDGET SENTINEL — Còn ${PCT_LEFT}% | Dùng /multi-run để tối ưu token."
fi

# Chỉ output khi có cảnh báo và chưa cảnh báo ở threshold này
if [[ -n "$MSG" ]]; then
  # Check xem đã cảnh báo threshold này chưa (tránh spam)
  LAST_PCT=0
  if [[ -f "$STATE_FILE" ]]; then
    LAST_PCT=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('last_warned_pct', 100))" 2>/dev/null || echo "100")
  fi

  # Chỉ warn khi lần đầu vượt ngưỡng (không lặp lại)
  SHOULD_WARN=0
  if [[ $PCT_LEFT -le 5 && $LAST_PCT -gt 5 ]]; then SHOULD_WARN=1; fi
  if [[ $PCT_LEFT -le 10 && $LAST_PCT -gt 10 ]]; then SHOULD_WARN=1; fi
  if [[ $PCT_LEFT -le 20 && $LAST_PCT -gt 20 ]]; then SHOULD_WARN=1; fi
  if [[ $PCT_LEFT -le 50 && $LAST_PCT -gt 50 ]]; then SHOULD_WARN=1; fi

  if [[ $SHOULD_WARN -eq 1 ]]; then
    # Update last warned
    python3 -c "
import json, os
path = '$STATE_FILE'
d = {}
if os.path.exists(path):
    try: d = json.load(open(path))
    except: d = {}
d['last_warned_pct'] = $PCT_LEFT
_tmp = path + '.tmp.' + str(os.getpid())
json.dump(d, open(_tmp, 'w'))
os.replace(_tmp, path)
" 2>/dev/null

    # Output warning — Claude Code PostToolUse hook format
    python3 -c "
import json
msg = '$MSG'
level = '$LEVEL'
pct_left = $PCT_LEFT
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'PostToolUse',
        'additionalContext': msg
    }
}))
" 2>/dev/null
  fi
fi

exit 0

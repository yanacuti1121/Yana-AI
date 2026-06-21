#!/usr/bin/env bash
# identity-gate.sh — Tiered Sovereign Identity Gate
#
# TIER 0 — GUEST:    No auth. Read-only, basic skills, no write ops.
# TIER 1 — OPERATOR: Knows passphrase. Can run tasks, limited commits.
# TIER 2 — SOVEREIGN: Knows full name "Vũ Văn Tâm". Full access, all 100 layers.
#
# Usage:
#   source core/gates/identity-gate.sh          — sets YANA_TIER in current shell
#   bash core/gates/identity-gate.sh            — interactive, prints tier
#   YANA_TIER_CHECK=sovereign <cmd>           — assert minimum tier before cmd
#
# Exit codes:
#   0 — auth complete (any tier)
#   8 — tier requirement not met
#   9 — max attempts exceeded
#
# Env set after auth:
#   YANA_TIER          — guest | operator | sovereign
#   YANA_TIER_LEVEL    — 0 | 1 | 2
#   YANA_IDENTITY_OK   — 1

set -uo pipefail

# ─── Hashed credentials (SHA-256) ────────────────────────────────────────────
# Repo chỉ chứa hash — không ai đọc code biết plaintext là gì.
# Anh set plaintext trong ~/.bashrc (không commit):
#   export YANA_SOVEREIGN_NAME="yana"
#   export YANA_OPERATOR_PASS="<passphrase riêng>"
#
# SHA-256(lowercase("vũ văn tâm")) — so sánh sau khi normalize về thường
SOVEREIGN_HASH="1835d61de8ab496236617fd2a76317e5c818177477ff8fb2312b3520e2990937"
# SHA-256 của operator pass lưu tương tự — set YANA_OPERATOR_PASS_HASH trong ~/.bashrc
# hoặc để script tự tính từ YANA_OPERATOR_PASS nếu có

hash_input() {
  if command -v openssl &>/dev/null; then
    echo -n "$1" | openssl dgst -sha256 2>/dev/null | awk '{print $2}'
  else
    echo -n "$1" | sha256sum 2>/dev/null | awk '{print $1}'
  fi
}

normalize() {
  echo "$1" | tr '[:upper:]' '[:lower:]'
}

# Pre-compute hashes từ env vars (nếu có) — plaintext không đi vào so sánh
SOVEREIGN_INPUT_HASH=""
OPERATOR_INPUT_HASH=""
if [[ -n "${YANA_SOVEREIGN_NAME:-}" ]]; then
  SOVEREIGN_INPUT_HASH="$(hash_input "$(normalize "$YANA_SOVEREIGN_NAME")")"
fi
if [[ -n "${YANA_OPERATOR_PASS:-}" ]]; then
  OPERATOR_INPUT_HASH="$(hash_input "$YANA_OPERATOR_PASS")"
fi
MAX_ATTEMPTS=3
AUDIT_FILE="releases/logs/identity-gate.log"
SESSION_ID="${YANA_SESSION_ID:-$(date +%s)}"

# ─── Permission matrix ────────────────────────────────────────────────────────
# GUEST (0):    read files, list skills, ask questions, dry-run only
# OPERATOR (1): run skills, create files, local commits (no push), no sovereign cmds
# SOVEREIGN (2): all of above + freeze swarm, rollback, push, release quarantine

GUEST_ALLOWS="read list ask dry-run skill-query"
OPERATOR_ALLOWS="${GUEST_ALLOWS} run-skill write-file commit validate smoke-test"
SOVEREIGN_ALLOWS="${OPERATOR_ALLOWS} push freeze-swarm rollback release-quarantine emergency-shutdown sovereign-gate"

# ─── Helpers ─────────────────────────────────────────────────────────────────
log_gate() {
  local tier="$1" status="$2" msg="$3"
  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$(dirname "$AUDIT_FILE")" 2>/dev/null || true
  echo "{\"ts\":\"${ts}\",\"gate\":\"identity\",\"tier\":\"${tier}\",\"status\":\"${status}\",\"session\":\"${SESSION_ID}\",\"msg\":\"${msg}\"}" \
    >> "$AUDIT_FILE" 2>/dev/null || true
}

print_banner() {
  echo "" >&2
  echo "╔══════════════════════════════════════════════╗" >&2
  echo "║      Yana AI — IDENTITY & ACCESS GATE         ║" >&2
  echo "║  Lớp Xác Thực Phân Quyền Tầng — L0          ║" >&2
  echo "╚══════════════════════════════════════════════╝" >&2
}

print_tier() {
  local tier="$1" level="$2"
  echo "" >&2
  case "$tier" in
    sovereign)
      echo "  ┌─────────────────────────────────────────┐" >&2
      echo "  │  👑  SOVEREIGN — Vũ Văn Tâm              │" >&2
      echo "  │  Tier 2 — Toàn quyền tối cao             │" >&2
      echo "  │  All 100 layers unlocked.                 │" >&2
      echo "  └─────────────────────────────────────────┘" >&2
      ;;
    operator)
      echo "  ┌─────────────────────────────────────────┐" >&2
      echo "  │  ⚙   OPERATOR — Authorized User          │" >&2
      echo "  │  Tier 1 — Run skills, write, commit       │" >&2
      echo "  │  Sovereign commands: LOCKED               │" >&2
      echo "  └─────────────────────────────────────────┘" >&2
      ;;
    guest)
      echo "  ┌─────────────────────────────────────────┐" >&2
      echo "  │  👤  GUEST — Unidentified                 │" >&2
      echo "  │  Tier 0 — Read-only, dry-run only         │" >&2
      echo "  │  Write / commit / sovereign: LOCKED       │" >&2
      echo "  └─────────────────────────────────────────┘" >&2
      ;;
  esac
  echo "" >&2
}

set_tier() {
  local tier="$1" level="$2"
  export YANA_TIER="$tier"
  export YANA_TIER_LEVEL="$level"
  export YANA_IDENTITY_OK=1
  log_gate "$tier" "GRANTED" "Tier ${level} access active"
  print_tier "$tier" "$level"
}

# ─── Main auth flow ──────────────────────────────────────────────────────────
print_banner

# Auto-auth từ env var — không cần nhập tay
if [[ -n "$SOVEREIGN_INPUT_HASH" && "$SOVEREIGN_INPUT_HASH" == "$SOVEREIGN_HASH" ]]; then
  echo "  Auto-auth từ YANA_SOVEREIGN_NAME..." >&2
  set_tier "sovereign" 2
  exit 0
fi
if [[ -n "$OPERATOR_INPUT_HASH" && "$OPERATOR_INPUT_HASH" == "$(hash_input "$(normalize "${YANA_OPERATOR_PASS:-}")")" ]]; then
  echo "  Auto-auth từ YANA_OPERATOR_PASS..." >&2
  set_tier "operator" 1
  exit 0
fi

# ─── Non-interactive verify mode (--verify [min_tier]) ───────────────────────
# FIX (audit 2026-06-21): this flag was documented in the header comment and
# called by safe-run.sh's BYPASS check, but never actually implemented — any
# invocation of `identity-gate.sh --verify` fell through to the interactive
# prompt below. On closed/non-tty stdin (exactly how callers like safe-run.sh
# invoke it: `bash identity-gate.sh --verify 2>/dev/null`), `read` hits EOF
# immediately, the loop defaults to GUEST, and the script still `exit 0`s —
# so the "identity verification" added to safe-run.sh's BYPASS path always
# passed, for any caller, with zero credentials. That made the P0 BYPASS fix
# in CORE_AUDIT.md cosmetic rather than real. This block makes --verify fail
# CLOSED (exit 8, the code the header already reserved for this) whenever
# env-var auto-auth above did not already grant the requested tier — it never
# touches stdin or the interactive loop.
if [[ "${1:-}" == "--verify" ]]; then
  REQUIRED="${2:-operator}"
  case "$REQUIRED" in
    guest)
      exit 0 ;;  # guest is the floor — reaching here always satisfies it
    operator|sovereign)
      log_gate "guest" "VERIFY-DENIED" "non-interactive verify required>=${REQUIRED}, no matching credential env var"
      echo "[identity-gate] DENIED — non-interactive verify requires tier >= ${REQUIRED}." >&2
      echo "[identity-gate] Set YANA_OPERATOR_PASS (operator) or YANA_SOVEREIGN_NAME (sovereign) to authenticate." >&2
      exit 8 ;;
    *)
      echo "[identity-gate] unknown tier '${REQUIRED}' for --verify (use guest|operator|sovereign)" >&2
      exit 8 ;;
  esac
fi

echo "  Nhập tên đầy đủ hoặc passphrase để xác thực." >&2
echo "  (Nhấn Enter để tiếp tục với quyền GUEST)     " >&2
echo "" >&2

ATTEMPT=0
TIER="guest"

while [[ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]]; do
  ATTEMPT=$(( ATTEMPT + 1 ))

  if [[ -t 0 ]]; then
    printf "  [%d/%d] Nhận dạng: " "$ATTEMPT" "$MAX_ATTEMPTS" >&2
    read -r INPUT
  else
    read -r INPUT || INPUT=""
  fi

  TRIMMED="$(echo "$INPUT" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

  # Empty → GUEST immediately
  if [[ -z "$TRIMMED" ]]; then
    TIER="guest"
    break
  fi

  # Sovereign check — normalize về thường trước khi hash (case-insensitive)
  INPUT_HASH="$(hash_input "$(normalize "$TRIMMED")")"
  if [[ -n "$SOVEREIGN_INPUT_HASH" && "$INPUT_HASH" == "$SOVEREIGN_HASH" ]]; then
    set_tier "sovereign" 2
    exit 0
  fi

  # Operator check — hash comparison
  if [[ -n "$OPERATOR_INPUT_HASH" && "$INPUT_HASH" == "$OPERATOR_INPUT_HASH" ]]; then
    set_tier "operator" 1
    exit 0
  fi

  # Wrong input
  log_gate "unknown" "MISMATCH" "Attempt ${ATTEMPT}/${MAX_ATTEMPTS} — input redacted"
  if [[ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]]; then
    echo "  Không khớp. Còn $(( MAX_ATTEMPTS - ATTEMPT )) lần. (Enter = Guest)" >&2
  else
    echo "  Hết lượt thử." >&2
  fi
done

# Default: GUEST after failed attempts or empty input
set_tier "guest" 0
exit 0

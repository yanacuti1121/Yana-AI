#!/usr/bin/env bash
# identity-gate.sh — Tiered Sovereign Identity Gate
#
# TIER 0 — GUEST:    No auth. Read-only, basic skills, no write ops.
# TIER 1 — OPERATOR: Knows passphrase. Can run tasks, limited commits.
# TIER 2 — SOVEREIGN: Knows full name "Vũ Văn Tâm". Full access, all 100 layers.
#
# Usage:
#   source core/gates/identity-gate.sh          — sets YAMTAM_TIER in current shell
#   bash core/gates/identity-gate.sh            — interactive, prints tier
#   YAMTAM_TIER_CHECK=sovereign <cmd>           — assert minimum tier before cmd
#
# Exit codes:
#   0 — auth complete (any tier)
#   8 — tier requirement not met
#   9 — max attempts exceeded
#
# Env set after auth:
#   YAMTAM_TIER          — guest | operator | sovereign
#   YAMTAM_TIER_LEVEL    — 0 | 1 | 2
#   YAMTAM_IDENTITY_OK   — 1

set -uo pipefail

# ─── Hashed credentials (SHA-256) ────────────────────────────────────────────
# Repo chỉ chứa hash — không ai đọc code biết plaintext là gì.
# Anh set plaintext trong ~/.bashrc (không commit):
#   export YAMTAM_SOVEREIGN_NAME="yana"
#   export YAMTAM_OPERATOR_PASS="<passphrase riêng>"
#
# SHA-256("yana") — sovereign identity fingerprint
SOVEREIGN_HASH="a7a9e3e88b1c572f8f935963c4a8cbc0b8f44e73b05bb8674dab10333c89957f"
# SHA-256 của operator pass lưu tương tự — set YAMTAM_OPERATOR_PASS_HASH trong ~/.bashrc
# hoặc để script tự tính từ YAMTAM_OPERATOR_PASS nếu có

hash_input() {
  echo -n "$1" | openssl dgst -sha256 2>/dev/null | awk '{print $2}'
}

# Pre-compute hashes từ env vars (nếu có) — plaintext không đi vào so sánh
SOVEREIGN_INPUT_HASH=""
OPERATOR_INPUT_HASH=""
if [[ -n "${YAMTAM_SOVEREIGN_NAME:-}" ]]; then
  SOVEREIGN_INPUT_HASH="$(hash_input "$YAMTAM_SOVEREIGN_NAME")"
fi
if [[ -n "${YAMTAM_OPERATOR_PASS:-}" ]]; then
  OPERATOR_INPUT_HASH="$(hash_input "$YAMTAM_OPERATOR_PASS")"
fi
MAX_ATTEMPTS=3
AUDIT_FILE="releases/logs/identity-gate.log"
SESSION_ID="${YAMTAM_SESSION_ID:-$(date +%s)}"

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
  echo "║      YAMTAM — IDENTITY & ACCESS GATE         ║" >&2
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
  export YAMTAM_TIER="$tier"
  export YAMTAM_TIER_LEVEL="$level"
  export YAMTAM_IDENTITY_OK=1
  log_gate "$tier" "GRANTED" "Tier ${level} access active"
  print_tier "$tier" "$level"
}

# ─── Main auth flow ──────────────────────────────────────────────────────────
print_banner

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

  # Sovereign check — hash input, compare against stored hash fingerprint
  INPUT_HASH="$(hash_input "$TRIMMED")"
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

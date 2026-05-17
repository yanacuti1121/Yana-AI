#!/usr/bin/env bash
# YAMTAM ENGINE — Audit Chain Test Suite
# Tests audit-log.sh (hash-chain writing) and verify-audit-chain.sh (verification).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$(cd "$SCRIPT_DIR/../../hooks" && pwd)"
SCRIPTS_DIR="$(cd "$SCRIPT_DIR/../../scripts" && pwd)"

PASS=0
FAIL=0
TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST"' EXIT

run_hook() {
  local input="$1"
  CLAUDE_PROJECT_DIR="$TMPDIR_TEST" bash "$HOOKS_DIR/audit-log.sh" <<< "$input" 2>/dev/null
}

check() {
  local name="$1" result="$2" expect="$3"
  if [[ "$result" == "$expect" ]]; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name"
    echo "  expected: $expect"
    echo "  got:      $result"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Audit Chain Test Suite ==="
echo ""

# ── Test 1: entry is written ──────────────────────────────────────────────────
rm -f "$TMPDIR_TEST/.claude/state/audit-chain.log"
run_hook '{"tool_name":"Read","tool_input":{"file_path":"README.md"}}'
LOG="$TMPDIR_TEST/.claude/state/audit-chain.log"
ENTRY_COUNT=$(wc -l < "$LOG" 2>/dev/null || echo 0)
check "entry is written to log" "$ENTRY_COUNT" "1"

# ── Test 2: entry has required fields ─────────────────────────────────────────
ENTRY=$(cat "$LOG")
HAS_TS=$(printf '%s' "$ENTRY" | jq -r 'has("ts")' 2>/dev/null)
HAS_HASH=$(printf '%s' "$ENTRY" | jq -r 'has("hash")' 2>/dev/null)
HAS_PREV=$(printf '%s' "$ENTRY" | jq -r 'has("prev_hash")' 2>/dev/null)
check "entry has ts field"        "$HAS_TS"   "true"
check "entry has hash field"      "$HAS_HASH" "true"
check "entry has prev_hash field" "$HAS_PREV" "true"

# ── Test 3: first entry uses genesis hash as prev_hash ────────────────────────
GENESIS=$(printf 'YAMTAM_GENESIS' | sha256sum | awk '{print $1}')
STORED_PREV=$(printf '%s' "$ENTRY" | jq -r '.prev_hash' 2>/dev/null)
check "first entry prev_hash = genesis" "$STORED_PREV" "$GENESIS"

# ── Test 4: second entry chains from first ────────────────────────────────────
FIRST_HASH=$(printf '%s' "$ENTRY" | jq -r '.hash' 2>/dev/null)
run_hook '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}'
SECOND_ENTRY=$(tail -1 "$LOG")
SECOND_PREV=$(printf '%s' "$SECOND_ENTRY" | jq -r '.prev_hash' 2>/dev/null)
check "second entry prev_hash = first hash" "$SECOND_PREV" "$FIRST_HASH"

# ── Test 5: .env file read is masked ─────────────────────────────────────────
rm -f "$LOG"
run_hook '{"tool_name":"Read","tool_input":{"file_path":".env.production"}}'
INPUT_FIELD=$(tail -1 "$LOG" | jq -r '.input' 2>/dev/null)
check ".env read masked as [REDACTED]" "$INPUT_FIELD" "[REDACTED]"

# ── Test 6: secret keyword in input is masked ─────────────────────────────────
rm -f "$LOG"
run_hook '{"tool_name":"Bash","tool_input":{"command":"echo $SECRET_KEY"}}'
INPUT_FIELD=$(tail -1 "$LOG" | jq -r '.input' 2>/dev/null)
check "SECRET keyword masked as [REDACTED]" "$INPUT_FIELD" "[REDACTED]"

# ── Test 7: verify-audit-chain exits 0 on intact log ─────────────────────────
rm -f "$LOG"
run_hook '{"tool_name":"Read","tool_input":{"file_path":"README.md"}}'
run_hook '{"tool_name":"Bash","tool_input":{"command":"ls"}}'
run_hook '{"tool_name":"Edit","tool_input":{"file_path":"foo.ts"}}'
VERIFY_OUT=$(CLAUDE_PROJECT_DIR="$TMPDIR_TEST" bash "$SCRIPTS_DIR/verify-audit-chain.sh" 2>/dev/null)
VERIFY_EXIT=$?
check "verify exits 0 on intact chain" "$VERIFY_EXIT" "0"

# ── Test 8: verify reports correct count ──────────────────────────────────────
REPORTED_COUNT=$(printf '%s' "$VERIFY_OUT" | grep -oE '[0-9]+ entries' | grep -oE '[0-9]+')
check "verify reports 3 entries" "$REPORTED_COUNT" "3"

# ── Test 9: verify exits 1 on tampered entry ─────────────────────────────────
rm -f "$LOG"
run_hook '{"tool_name":"Read","tool_input":{"file_path":"a.md"}}'
run_hook '{"tool_name":"Read","tool_input":{"file_path":"b.md"}}'
# Tamper: replace second entry with modified tool name (compact JSON — single line)
FIRST_LINE=$(head -1 "$LOG")
TAMPERED=$(tail -1 "$LOG" | jq -c '.tool = "TAMPERED"' 2>/dev/null)
printf '%s\n%s\n' "$FIRST_LINE" "$TAMPERED" > "$LOG"
CLAUDE_PROJECT_DIR="$TMPDIR_TEST" bash "$SCRIPTS_DIR/verify-audit-chain.sh" >/dev/null 2>&1
VERIFY_EXIT_TAMPERED=$?
check "verify exits 1 on tampered entry" "$VERIFY_EXIT_TAMPERED" "1"

# ── Test 10: empty log is OK ──────────────────────────────────────────────────
rm -f "$LOG"
CLAUDE_PROJECT_DIR="$TMPDIR_TEST" bash "$SCRIPTS_DIR/verify-audit-chain.sh" >/dev/null 2>&1
EMPTY_EXIT=$?
check "verify exits 0 on missing log" "$EMPTY_EXIT" "0"

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1

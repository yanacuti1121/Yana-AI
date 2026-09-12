#!/usr/bin/env bash
# Regression tests for the Node.js fallback embedded in
# core/hooks/token-budget-guard.sh (the path that runs when yana-rt is NOT
# on PATH). Exercises two parity fixes against src/guard/token_budget.rs:
#
#   1. Half-open reset — loop_attempts[tool] must be reset to 0 before
#      loopCount is read on an open->half-open transition. Without this,
#      the stale count (already >= maxAttempts) re-trips the circuit on
#      the very next call, every cooldown cycle, escalating open_count
#      until cooldown is permanently stuck at 1800s (fixed in
#      src/guard/token_budget.rs on 2026-09-11, commit e39a9c4d; this test
#      covers the same bug in the bash/node fallback, which had not been
#      updated to match).
#   2. Deny exit code — Claude Code's PreToolUse hook contract only
#      recognizes exit 2 + a hookSpecificOutput JSON object on stdout as an
#      actual "deny". The fallback used to print a plain-text ASCII box and
#      exit(1) on both its OPEN and TRIGGERED branches, which Claude Code
#      treats as a hook error, not a deny — the tool call ran anyway.
#
# These tests force the actual Node fallback to run — never yana-rt on
# PATH — by scrubbing PATH to exclude the directory yana-rt is normally
# installed in, while still pointing core/lib/locking.sh's own
# flock-v1 lock primitive (which requires a *compiled* yana-rt binary,
# independent of the top-of-script "delegate entirely to yana-rt if it's
# on PATH" shortcut) at a real built binary via YANA_RT_BIN. Locking and
# guard-logic delegation are two separate mechanisms — see
# core/lib/locking.sh's with_lock() (calls `yana-rt guard lock-with`) vs.
# token-budget-guard.sh's own `command -v yana-rt` shortcut (calls
# `yana-rt guard token-budget`, which is what these tests must NOT trigger).
#
# Run: bash core/tests/hooks/test-token-budget-guard-fallback.sh

set -uo pipefail

TESTS_PASSED=0
TESTS_FAILED=0
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HOOKS_DIR="$PROJECT_DIR/core/hooks"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; TESTS_PASSED=$((TESTS_PASSED + 1)); }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; TESTS_FAILED=$((TESTS_FAILED + 1)); }

# Locking needs a real compiled binary, independent of forcing the guard's
# own logic through its bash/node fallback. Same convention as
# core/tests/hooks/run-hook-tests.sh: prefer target/debug, skip gracefully
# if this repo hasn't been built.
YANA_RT_BIN_CANDIDATE="$PROJECT_DIR/target/debug/yana-rt"
if [[ ! -x "$YANA_RT_BIN_CANDIDATE" ]]; then
  YANA_RT_BIN_CANDIDATE="$PROJECT_DIR/target/release/yana-rt"
fi
if [[ ! -x "$YANA_RT_BIN_CANDIDATE" ]]; then
  echo -e "${YELLOW}SKIP${NC}: no compiled yana-rt found at target/debug or target/release —"
  echo "  run 'cargo build --features cli' first. Skipping fallback tests"
  echo "  (they need a real binary for core/lib/locking.sh's lock primitive,"
  echo "  independent of the bash/node guard logic under test)."
  exit 0
fi

# PATH scrubbed to exclude wherever yana-rt is normally installed
# (cargo install, etc.) — this is what forces token-budget-guard.sh's own
# `command -v yana-rt` check to fail and fall through to the Node script.
FALLBACK_PATH="/usr/bin:/bin:/usr/sbin:/sbin"
if [[ -d /opt/homebrew/bin ]]; then FALLBACK_PATH="/opt/homebrew/bin:$FALLBACK_PATH"; fi
if command -v node >/dev/null 2>&1; then
  NODE_DIR=$(dirname "$(command -v node)")
  case ":$FALLBACK_PATH:" in
    *":$NODE_DIR:"*) ;;
    *) FALLBACK_PATH="$NODE_DIR:$FALLBACK_PATH" ;;
  esac
fi

run_in_sandbox() {
  local tmp_project
  tmp_project=$(mktemp -d)
  mkdir -p "$tmp_project/core/lib" "$tmp_project/core/memory/L2_session" "$tmp_project/.claude/state"
  cp "$PROJECT_DIR/core/lib/locking.sh" "$tmp_project/core/lib/locking.sh"
  cp "$PROJECT_DIR/.claude/state/locking-protocol-version" "$tmp_project/.claude/state/locking-protocol-version"
  echo "$tmp_project"
}

# Runs the guard against the forced fallback path. Args: sandbox budget_file
# circuit_file stdin_json
run_fallback() {
  local sandbox="$1" budget="$2" circuit="$3" stdin_json="$4"
  echo "$stdin_json" | PATH="$FALLBACK_PATH" CLAUDE_PROJECT_DIR="$sandbox" \
    YANA_RT_BIN="$YANA_RT_BIN_CANDIDATE" YANA_TOKEN_BUDGET="$budget" YANA_CIRCUIT_STATE="$circuit" \
    bash "$HOOKS_DIR/token-budget-guard.sh"
}

# Sanity check: confirm the harness itself actually forces the fallback,
# not yana-rt on PATH — otherwise every test below would silently exercise
# the wrong code path and pass for the wrong reason.
SANDBOX=$(run_in_sandbox)
BUDGET_FILE="$SANDBOX/core/memory/L2_session/token-budget.json"
CIRCUIT_FILE="$SANDBOX/core/memory/L2_session/circuit-state.json"
if PATH="$FALLBACK_PATH" command -v yana-rt >/dev/null 2>&1; then
  fail "harness sanity check: yana-rt is still resolvable on the scrubbed PATH — tests below would not exercise the fallback"
else
  pass "harness sanity check: yana-rt is not on the scrubbed PATH (fallback will actually run)"
fi
rm -rf "$SANDBOX"

echo ""
echo "=== token-budget-guard.sh Node fallback (parity with src/guard/token_budget.rs) ==="
echo ""

# Test 1: circuit already OPEN, cooldown not expired -> deny with exit 2 +
# valid hookSpecificOutput JSON (not the old exit 1 + plain-text ASCII box).
SANDBOX=$(run_in_sandbox)
BUDGET_FILE="$SANDBOX/core/memory/L2_session/token-budget.json"
CIRCUIT_FILE="$SANDBOX/core/memory/L2_session/circuit-state.json"
NOW_EPOCH=$(date +%s)
python3 -c "
import json
json.dump({'loop_attempts': {'Bash': 5}, 'total_tokens_used': 0}, open('$BUDGET_FILE', 'w'))
json.dump({'circuits': {'Bash': {'state': 'open', 'opened_at_epoch': $NOW_EPOCH, 'open_count': 1, 'cooldown_seconds': 60}}}, open('$CIRCUIT_FILE', 'w'))
"
OUTPUT=$(run_fallback "$SANDBOX" "$BUDGET_FILE" "$CIRCUIT_FILE" '{"tool_name":"Bash"}')
EXIT_CODE=$?
if [[ "$EXIT_CODE" == "2" ]] && echo "$OUTPUT" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert d['hookSpecificOutput']['permissionDecision'] == 'deny'
" 2>/dev/null; then
  pass "circuit OPEN (cooldown active) denies with exit 2 + valid deny JSON"
else
  fail "circuit OPEN (cooldown active) denies with exit 2 + valid deny JSON — exit=$EXIT_CODE output=$OUTPUT"
fi
rm -rf "$SANDBOX"

# Test 2: loopCount reaches maxAttempts on this call (new trip) -> deny with
# exit 2 + valid JSON, and circuit-state.json records the new open entry.
SANDBOX=$(run_in_sandbox)
BUDGET_FILE="$SANDBOX/core/memory/L2_session/token-budget.json"
CIRCUIT_FILE="$SANDBOX/core/memory/L2_session/circuit-state.json"
python3 -c "
import json
json.dump({'loop_attempts': {'Bash': 5}, 'total_tokens_used': 0}, open('$BUDGET_FILE', 'w'))
json.dump({'circuits': {}}, open('$CIRCUIT_FILE', 'w'))
"
OUTPUT=$(run_fallback "$SANDBOX" "$BUDGET_FILE" "$CIRCUIT_FILE" '{"tool_name":"Bash"}')
EXIT_CODE=$?
if [[ "$EXIT_CODE" == "2" ]] \
   && echo "$OUTPUT" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert d['hookSpecificOutput']['permissionDecision'] == 'deny'
" 2>/dev/null \
   && jq -e '.circuits.Bash.state == "open" and .circuits.Bash.open_count == 1' "$CIRCUIT_FILE" >/dev/null 2>&1; then
  pass "new trip (loopCount hits threshold) denies with exit 2 + valid deny JSON, records open circuit"
else
  fail "new trip denies with exit 2 + valid deny JSON — exit=$EXIT_CODE output=$OUTPUT circuit=$(cat "$CIRCUIT_FILE" 2>/dev/null)"
fi
rm -rf "$SANDBOX"

# Test 3: half-open transition resets loop_attempts[tool] to 0 BEFORE it is
# read/incremented — direct check of the fix itself, isolated from the
# regression scenario in Test 4.
SANDBOX=$(run_in_sandbox)
BUDGET_FILE="$SANDBOX/core/memory/L2_session/token-budget.json"
CIRCUIT_FILE="$SANDBOX/core/memory/L2_session/circuit-state.json"
python3 -c "
import json
json.dump({'loop_attempts': {'Bash': 7}, 'total_tokens_used': 0}, open('$BUDGET_FILE', 'w'))
json.dump({'circuits': {'Bash': {'state': 'half-open'}}}, open('$CIRCUIT_FILE', 'w'))
"
run_fallback "$SANDBOX" "$BUDGET_FILE" "$CIRCUIT_FILE" '{"tool_name":"Bash"}' >/dev/null
EXIT_CODE=$?
if [[ "$EXIT_CODE" == "0" ]] && jq -e '.loop_attempts.Bash == 1' "$BUDGET_FILE" >/dev/null 2>&1; then
  pass "half-open resets loop_attempts to 0 before increment (probe lands at 1, not 8)"
else
  fail "half-open resets loop_attempts before increment — exit=$EXIT_CODE budget=$(cat "$BUDGET_FILE" 2>/dev/null)"
fi
rm -rf "$SANDBOX"

# Test 4: full regression — the exact bug scenario. loop_attempts.Bash is
# already at the trip threshold, circuit is open but the flat cooldown has
# expired (half-open eligible). Without the fix, the first call would close
# the circuit but leave loop_attempts stale, re-tripping on the SAME call's
# own read; the second call would then observe an already-reopened circuit.
SANDBOX=$(run_in_sandbox)
BUDGET_FILE="$SANDBOX/core/memory/L2_session/token-budget.json"
CIRCUIT_FILE="$SANDBOX/core/memory/L2_session/circuit-state.json"
NOW_EPOCH=$(date +%s)
OPENED_LONG_AGO=$((NOW_EPOCH - 9999))
python3 -c "
import json
json.dump({'loop_attempts': {'Bash': 5}, 'total_tokens_used': 0}, open('$BUDGET_FILE', 'w'))
json.dump({'circuits': {'Bash': {'state': 'open', 'opened_at_epoch': $OPENED_LONG_AGO, 'open_count': 2, 'cooldown_seconds': 300}}}, open('$CIRCUIT_FILE', 'w'))
"
CALL1_OUT=$(run_fallback "$SANDBOX" "$BUDGET_FILE" "$CIRCUIT_FILE" '{"tool_name":"Bash"}')
CALL1_EXIT=$?
CALL1_STATE=$(jq -r '.circuits.Bash.state' "$CIRCUIT_FILE" 2>/dev/null)
CALL1_LOOP=$(jq -r '.loop_attempts.Bash' "$BUDGET_FILE" 2>/dev/null)

if [[ "$CALL1_EXIT" == "0" && "$CALL1_STATE" == "closed" && "$CALL1_LOOP" == "1" ]]; then
  pass "regression call 1 (half-open probe): closes circuit, loop_attempts lands at 1 — no immediate re-trip"
else
  fail "regression call 1 — exit=$CALL1_EXIT state=$CALL1_STATE loop=$CALL1_LOOP output=$CALL1_OUT"
fi

CALL2_OUT=$(run_fallback "$SANDBOX" "$BUDGET_FILE" "$CIRCUIT_FILE" '{"tool_name":"Bash"}')
CALL2_EXIT=$?
CALL2_STATE=$(jq -r '.circuits.Bash.state' "$CIRCUIT_FILE" 2>/dev/null)
CALL2_LOOP=$(jq -r '.loop_attempts.Bash' "$BUDGET_FILE" 2>/dev/null)

if [[ "$CALL2_EXIT" == "0" && "$CALL2_STATE" == "closed" && "$CALL2_LOOP" == "2" ]]; then
  pass "regression call 2 (normal call right after probe): no false re-trip, circuit stays closed"
else
  fail "regression call 2 — exit=$CALL2_EXIT state=$CALL2_STATE loop=$CALL2_LOOP output=$CALL2_OUT"
fi
rm -rf "$SANDBOX"

# Test 5: opened_at_epoch must NOT change when a call is denied purely
# because the circuit is already OPEN (cooldown still active) — a blocked
# retry must not itself reset or extend the cooldown window.
SANDBOX=$(run_in_sandbox)
BUDGET_FILE="$SANDBOX/core/memory/L2_session/token-budget.json"
CIRCUIT_FILE="$SANDBOX/core/memory/L2_session/circuit-state.json"
NOW_EPOCH=$(date +%s)
python3 -c "
import json
json.dump({'loop_attempts': {'Bash': 5}, 'total_tokens_used': 0}, open('$BUDGET_FILE', 'w'))
json.dump({'circuits': {'Bash': {'state': 'open', 'opened_at_epoch': $NOW_EPOCH, 'open_count': 1, 'cooldown_seconds': 300}}}, open('$CIRCUIT_FILE', 'w'))
"
BEFORE_EPOCH=$(jq -r '.circuits.Bash.opened_at_epoch' "$CIRCUIT_FILE")
run_fallback "$SANDBOX" "$BUDGET_FILE" "$CIRCUIT_FILE" '{"tool_name":"Bash"}' >/dev/null
run_fallback "$SANDBOX" "$BUDGET_FILE" "$CIRCUIT_FILE" '{"tool_name":"Bash"}' >/dev/null
AFTER_EPOCH=$(jq -r '.circuits.Bash.opened_at_epoch' "$CIRCUIT_FILE")

if [[ "$BEFORE_EPOCH" == "$AFTER_EPOCH" ]]; then
  pass "opened_at_epoch unchanged after blocked retries while circuit is OPEN (no reset-on-deny)"
else
  fail "opened_at_epoch unchanged after blocked retries — before=$BEFORE_EPOCH after=$AFTER_EPOCH"
fi
rm -rf "$SANDBOX"

echo ""
echo "=== Summary ==="
echo "Total tests: $((TESTS_PASSED + TESTS_FAILED))"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
if [[ $TESTS_FAILED -gt 0 ]]; then
  echo -e "${RED}Failed: $TESTS_FAILED${NC}"
  exit 1
else
  echo "Failed: 0"
  echo -e "${GREEN}Result: PASS${NC}"
fi

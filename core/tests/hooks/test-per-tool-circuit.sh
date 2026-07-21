#!/usr/bin/env bash
# Test suite for per-tool-circuit-breaker.sh (v1.8.0)
# Run: bash core/tests/hooks/test-per-tool-circuit.sh

set -euo pipefail

TESTS_PASSED=0
TESTS_FAILED=0
HOOKS_DIR="${1:-.}/core/hooks"
STATE_DIR=".claude/state"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Setup
mkdir -p "$STATE_DIR"
rm -f "$STATE_DIR/per-tool-circuit.jsonl" "$STATE_DIR/circuit-metrics.jsonl"

test_case() {
  local name="$1"
  local description="$2"
  local expected_exit="$3"
  local setup_cmd="${4:-}"
  local input="${5:-}"

  # Reset state before each test
  rm -f ".claude/state/per-tool-circuit.jsonl" 2>/dev/null || true

  # Run setup if provided
  if [[ -n "$setup_cmd" ]]; then
    eval "$setup_cmd" > /dev/null 2>&1 || true
  fi

  # Run test
  local actual_exit=0
  if [[ -n "$input" ]]; then
    export CIRCUIT_TEST_INPUT="$input"
    bash "$HOOKS_DIR/per-tool-circuit-breaker.sh" > /dev/null 2>&1 || actual_exit=$?
  else
    bash "$HOOKS_DIR/per-tool-circuit-breaker.sh" <<< "" > /dev/null 2>&1 || actual_exit=$?
  fi

  # Check result
  if [[ "$actual_exit" == "$expected_exit" ]]; then
    echo -e "${GREEN}✓ PASS${NC}: $name — $description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}✗ FAIL${NC}: $name — $description (expected exit $expected_exit, got $actual_exit)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi

  # Cleanup
  unset CIRCUIT_TEST_INPUT
  unset YANA_CIRCUIT_BYPASS 2>/dev/null || true
}

echo "=== per-tool-circuit-breaker.sh (v1.8.0) ==="
echo ""

# Test 1: Unknown tool should allow (exit 0)
test_case \
  "per-tool-circuit-breaker.sh" \
  "Unknown tool allowed" \
  "0" \
  "" \
  '{"tool_name":"UnknownTool"}'

# Test 2: Tool without state should allow (CLOSED by default)
test_case \
  "per-tool-circuit-breaker.sh" \
  "New tool defaults to CLOSED" \
  "0" \
  "" \
  '{"tool_name":"Bash"}'

# Test 3: Bypass flag suppresses block
test_case \
  "per-tool-circuit-breaker.sh" \
  "Bypass flag suppresses blocking" \
  "0" \
  "export YANA_CIRCUIT_BYPASS=1; echo '{\"tool_name\":\"Bash\",\"state\":\"OPEN\"}' >> $STATE_DIR/per-tool-circuit.jsonl" \
  '{"tool_name":"Bash"}'

# Test 4: Missing input exits gracefully
test_case \
  "per-tool-circuit-breaker.sh" \
  "Empty input handled gracefully" \
  "0" \
  "" \
  ""

# Test 5: Bash state CLOSED should allow
test_case \
  "per-tool-circuit-breaker.sh" \
  "CLOSED state allows tool" \
  "0" \
  "" \
  '{"tool_name":"Bash"}'

# Test 6: Tool in HALF_OPEN state warns (exit 1)
test_case \
  "per-tool-circuit-breaker.sh" \
  "HALF_OPEN state warns" \
  "1" \
  "jq -cn '{tool_name:\"Write\",state:\"HALF_OPEN\",failure_count:5,cooldown_until_epoch:0,backoff_exponent:2,fast_tier_triggered:false}' >> $STATE_DIR/per-tool-circuit.jsonl" \
  '{"tool_name":"Write"}'

# Test 7: concurrent update_state() calls don't corrupt an unrelated tool's
# entry (2026-07-19 fix — code-auditor review of core/hooks/sandbox-wrap.sh
# found this state file's old grep-to-fixed-tmp-name-then-mv pattern has no
# protection against genuinely concurrent callers, reproduced live: 8
# concurrent invocations against a 2-entry file silently deleted an
# unrelated tool's OPEN entry. Fixed with fcntl.flock(LOCK_EX) around the
# whole read-modify-write, same pattern tool-guardrails-detector.sh already
# uses for the identical shared-JSONL-state-file problem. This test drives
# real concurrent subprocesses, not a single-call unit check — the bug
# specifically didn't reproduce under sequential single-invocation testing.
echo ""
echo -n "Testing per-tool-circuit-breaker.sh [8 concurrent OPEN->HALF_OPEN transitions for one tool don't corrupt an unrelated tool's entry]... "
TOTAL_CONCURRENCY_TESTS=$((TESTS_PASSED + TESTS_FAILED + 1))
_concurrency_tmp=$(mktemp -d)
_concurrency_state="$_concurrency_tmp/per-tool-circuit.jsonl"
printf '{"tool_name":"Bash","state":"OPEN","failure_count":5,"last_failure_time":"2026-07-19T00:00:00Z","cooldown_until_epoch":1,"backoff_exponent":1,"fast_tier_triggered":false}\n{"tool_name":"WebFetch","state":"OPEN","failure_count":5,"last_failure_time":"2026-07-19T00:00:00Z","cooldown_until_epoch":2000000000,"backoff_exponent":1,"fast_tier_triggered":false}\n' \
  > "$_concurrency_state"

for _i in 1 2 3 4 5 6 7 8; do
  ( echo '{"tool_name":"Bash"}' | YANA_CIRCUIT_STATE_FILE="$_concurrency_state" \
      bash "$HOOKS_DIR/per-tool-circuit-breaker.sh" >/dev/null 2>&1 ) &
done
wait

_line_count=$(wc -l < "$_concurrency_state" | tr -d ' ')
_webfetch_count=$(grep -c "WebFetch" "$_concurrency_state" || true)
_bash_count=$(grep -c '"tool_name":"Bash"' "$_concurrency_state" || true)
rm -rf "$_concurrency_tmp"

if [[ "$_line_count" == "2" && "$_webfetch_count" == "1" && "$_bash_count" == "1" ]]; then
  echo -e "${GREEN}✓ PASS${NC}"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}✗ FAIL${NC} (expected 2 lines / 1 WebFetch / 1 Bash entry, got lines=$_line_count webfetch=$_webfetch_count bash=$_bash_count)"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

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

#!/usr/bin/env bash
# Test suite for token-budget-guard.sh's stdin tool-name resolution fix and
# its companion token-budget-reset.sh (2026-09-05).
#
# Regression covered: CLAUDE_TOOL_NAME is never set by Claude Code's
# PreToolUse hook contract (tool_name arrives on stdin as JSON instead), so
# every call used to fall through to the shared 'unknown' bucket — one
# circuit breaker for the whole session instead of one per tool. Reproduced
# live: a single Skill call tripped the same 'unknown' circuit that then
# blocked Bash and Read too.
#
# Run: bash core/tests/hooks/test-token-budget-reset.sh

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

# with_lock() needs a compiled yana-rt. Use the binary built from this
# checkout when there is one (same order as
# test-token-budget-guard-fallback.sh; CI builds target/release and never
# puts it on PATH), otherwise one on PATH. With neither, skip, unless
# YANA_TEST_REQUIRE_RT=1 (set in CI) turns the skip into a failure.
YANA_RT_BIN_CANDIDATE="$PROJECT_DIR/target/debug/yana-rt"
if [[ ! -x "$YANA_RT_BIN_CANDIDATE" ]]; then
  YANA_RT_BIN_CANDIDATE="$PROJECT_DIR/target/release/yana-rt"
fi
if [[ -x "$YANA_RT_BIN_CANDIDATE" ]]; then
  export YANA_RT_BIN="$YANA_RT_BIN_CANDIDATE"
elif ! command -v yana-rt >/dev/null 2>&1; then
  if [[ "${YANA_TEST_REQUIRE_RT:-}" == "1" ]]; then
    echo -e "${RED}✗ FAIL${NC}: no compiled yana-rt (target/debug, target/release or PATH) and YANA_TEST_REQUIRE_RT=1"
    exit 1
  fi
  echo -e "${YELLOW}SKIP${NC}: no compiled yana-rt found at target/debug, target/release or on PATH."
  echo "  Run 'cargo build --bin yana-rt' first."
  exit 0
fi

# Isolated project dir per test — never touch the real session state files.
# Needs core/lib/locking.sh AND the flock-v1 protocol marker
# (.claude/state/locking-protocol-version): without it with_lock() refuses
# to run ("protocol marker missing"). The marker is written here, not copied
# from the checkout: .claude/state/ is gitignored, so a fresh clone has none.
run_in_sandbox() {
  local tmp_project
  tmp_project=$(mktemp -d)
  mkdir -p "$tmp_project/core/lib" "$tmp_project/core/memory/L2_session" "$tmp_project/.claude/state"
  cp "$PROJECT_DIR/core/lib/locking.sh" "$tmp_project/core/lib/locking.sh"
  printf 'flock-v1\n' > "$tmp_project/.claude/state/locking-protocol-version"
  echo "$tmp_project"
}

echo "=== token-budget-guard.sh / token-budget-reset.sh (2026-09-05 stdin fix) ==="
echo ""

# Test 1: stdin tool_name is honored — a Bash call increments
# loop_attempts.Bash, not loop_attempts.unknown.
SANDBOX=$(run_in_sandbox)
BUDGET_FILE="$SANDBOX/core/memory/L2_session/token-budget.json"
CIRCUIT_FILE="$SANDBOX/core/memory/L2_session/circuit-state.json"
echo '{"tool_name":"Bash","tool_input":{"command":"echo hi"}}' \
  | CLAUDE_PROJECT_DIR="$SANDBOX" YANA_TOKEN_BUDGET="$BUDGET_FILE" YANA_CIRCUIT_STATE="$CIRCUIT_FILE" \
    bash "$HOOKS_DIR/token-budget-guard.sh" >/dev/null 2>&1

if [[ -f "$BUDGET_FILE" ]] && jq -e '.loop_attempts.Bash == 1' "$BUDGET_FILE" >/dev/null 2>&1 \
   && ! jq -e '.loop_attempts.unknown' "$BUDGET_FILE" >/dev/null 2>&1; then
  pass "stdin tool_name resolves to real name (Bash), not 'unknown'"
else
  fail "stdin tool_name resolves to real name (Bash), not 'unknown' — $(cat "$BUDGET_FILE" 2>/dev/null || echo 'no budget file')"
fi
rm -rf "$SANDBOX"

# Test 2: two different tools accumulate independent counters — the exact
# bug (one shared 'unknown' bucket) would collapse these into one counter.
SANDBOX=$(run_in_sandbox)
BUDGET_FILE="$SANDBOX/core/memory/L2_session/token-budget.json"
CIRCUIT_FILE="$SANDBOX/core/memory/L2_session/circuit-state.json"
echo '{"tool_name":"Bash"}' | CLAUDE_PROJECT_DIR="$SANDBOX" YANA_TOKEN_BUDGET="$BUDGET_FILE" YANA_CIRCUIT_STATE="$CIRCUIT_FILE" \
  bash "$HOOKS_DIR/token-budget-guard.sh" >/dev/null 2>&1
echo '{"tool_name":"Read"}' | CLAUDE_PROJECT_DIR="$SANDBOX" YANA_TOKEN_BUDGET="$BUDGET_FILE" YANA_CIRCUIT_STATE="$CIRCUIT_FILE" \
  bash "$HOOKS_DIR/token-budget-guard.sh" >/dev/null 2>&1

if jq -e '.loop_attempts.Bash == 1 and .loop_attempts.Read == 1' "$BUDGET_FILE" >/dev/null 2>&1; then
  pass "Bash and Read accumulate independent loop counters (not merged under 'unknown')"
else
  fail "Bash and Read accumulate independent loop counters — $(cat "$BUDGET_FILE" 2>/dev/null)"
fi
rm -rf "$SANDBOX"

# Test 3: missing/empty stdin still resolves via env fallback, never crashes.
SANDBOX=$(run_in_sandbox)
BUDGET_FILE="$SANDBOX/core/memory/L2_session/token-budget.json"
CIRCUIT_FILE="$SANDBOX/core/memory/L2_session/circuit-state.json"
echo -n '' | CLAUDE_PROJECT_DIR="$SANDBOX" YANA_TOKEN_BUDGET="$BUDGET_FILE" YANA_CIRCUIT_STATE="$CIRCUIT_FILE" \
  CLAUDE_TOOL_NAME="Grep" bash "$HOOKS_DIR/token-budget-guard.sh" >/dev/null 2>&1
EXIT_CODE=$?
if [[ "$EXIT_CODE" == "0" ]] && jq -e '.loop_attempts.Grep == 1' "$BUDGET_FILE" >/dev/null 2>&1; then
  pass "empty stdin falls back to CLAUDE_TOOL_NAME env var without crashing"
else
  fail "empty stdin falls back to CLAUDE_TOOL_NAME env var — exit=$EXIT_CODE $(cat "$BUDGET_FILE" 2>/dev/null || true)"
fi
rm -rf "$SANDBOX"

# Test 4: token-budget-reset.sh clears the counter for the tool named in its
# stdin payload, and leaves other tools' counters untouched.
SANDBOX=$(run_in_sandbox)
BUDGET_FILE="$SANDBOX/core/memory/L2_session/token-budget.json"
CIRCUIT_FILE="$SANDBOX/core/memory/L2_session/circuit-state.json"
mkdir -p "$(dirname "$BUDGET_FILE")"
jq -n '{loop_attempts:{Bash:5,Read:2}}' > "$BUDGET_FILE"
jq -n '{circuits:{Bash:{state:"OPEN"},Read:{state:"CLOSED"}}}' > "$CIRCUIT_FILE"

echo '{"tool_name":"Bash"}' | CLAUDE_PROJECT_DIR="$SANDBOX" YANA_TOKEN_BUDGET="$BUDGET_FILE" YANA_CIRCUIT_STATE="$CIRCUIT_FILE" \
  bash "$HOOKS_DIR/token-budget-reset.sh" >/dev/null 2>&1

if jq -e '.loop_attempts.Bash == 0 and .loop_attempts.Read == 2' "$BUDGET_FILE" >/dev/null 2>&1 \
   && jq -e '.circuits.Bash.state == "closed" and .circuits.Read.state == "CLOSED"' "$CIRCUIT_FILE" >/dev/null 2>&1; then
  pass "reset clears only the named tool's counter and circuit, leaves others untouched"
else
  fail "reset clears only the named tool's counter and circuit — budget=$(cat "$BUDGET_FILE") circuit=$(cat "$CIRCUIT_FILE")"
fi
rm -rf "$SANDBOX"

# Test 5: reset on a tool with no prior state is a harmless no-op.
SANDBOX=$(run_in_sandbox)
BUDGET_FILE="$SANDBOX/core/memory/L2_session/token-budget.json"
CIRCUIT_FILE="$SANDBOX/core/memory/L2_session/circuit-state.json"
echo '{"tool_name":"NeverSeenTool"}' | CLAUDE_PROJECT_DIR="$SANDBOX" YANA_TOKEN_BUDGET="$BUDGET_FILE" YANA_CIRCUIT_STATE="$CIRCUIT_FILE" \
  bash "$HOOKS_DIR/token-budget-reset.sh" >/dev/null 2>&1
EXIT_CODE=$?
if [[ "$EXIT_CODE" == "0" ]]; then
  pass "reset on unknown tool with no prior state is a harmless no-op"
else
  fail "reset on unknown tool with no prior state — exit=$EXIT_CODE"
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

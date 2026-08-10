#!/usr/bin/env bash
# Test suite for precompact-priority-injection.sh
# Run: bash core/tests/hooks/test-precompact-priority-injection.sh

set -uo pipefail

TESTS_PASSED=0
TESTS_FAILED=0
HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../hooks" && pwd)"
HOOK="$HOOKS_DIR/precompact-priority-injection.sh"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

assert_exit() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo -e "${GREEN}PASS${NC}: $name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}FAIL${NC}: $name (expected exit $expected, got $actual)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo -e "${GREEN}PASS${NC}: $name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}FAIL${NC}: $name (expected output to contain: $needle)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_empty() {
  local name="$1" haystack="$2"
  if [[ -z "$haystack" ]]; then
    echo -e "${GREEN}PASS${NC}: $name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}FAIL${NC}: $name (expected empty stdout, got: $haystack)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

echo "=== precompact-priority-injection.sh test suite ==="
echo "Hook: $HOOK"
echo ""

# 1. Block case (in the advisory sense — the injection fires): default
# behavior, no bypass set, produces the priority block on stdout, exit 0.
OUT=$(env -u YANA_PRECOMPACT_INJECT_BYPASS bash "$HOOK" <<<'{}')
EXIT=$?
assert_exit "default (no bypass) exits 0" 0 "$EXIT"
assert_contains "default injects the priority block" "<yana-ai-priority-preservation>" "$OUT"
assert_contains "priority block covers unanswered questions" "UNANSWERED QUESTIONS" "$OUT"
assert_contains "priority block covers file:line citations" "FILE:LINE CITATIONS" "$OUT"
assert_contains "priority block covers exact numbers" "EXACT NUMBERS" "$OUT"
assert_contains "priority block covers Known/Unknown/Assumed" "KNOWN / UNKNOWN / ASSUMED" "$OUT"
assert_contains "priority block covers subagent reports" "SUBAGENT REPORTS ARE PRIMARY EVIDENCE" "$OUT"
assert_contains "priority block covers root cause vs hypothesis" "ROOT CAUSES CONFIRMED VS. HYPOTHESES RULED OUT" "$OUT"

# 2. Allow case (in the advisory sense — injection is skipped cleanly):
# bypass env var set produces no stdout and still exits 0.
OUT=$(YANA_PRECOMPACT_INJECT_BYPASS=1 bash "$HOOK" <<<'{}')
EXIT=$?
assert_exit "YANA_PRECOMPACT_INJECT_BYPASS=1 exits 0" 0 "$EXIT"
assert_empty "YANA_PRECOMPACT_INJECT_BYPASS=1 produces no stdout" "$OUT"

# 3. Bypass case (explicit "0" is treated as not-bypassed, matching the
# hook's own `[[ ... == "1" ]]` check rather than any other truthy value).
OUT=$(YANA_PRECOMPACT_INJECT_BYPASS=0 bash "$HOOK" <<<'{}')
EXIT=$?
assert_exit "YANA_PRECOMPACT_INJECT_BYPASS=0 exits 0" 0 "$EXIT"
assert_contains "YANA_PRECOMPACT_INJECT_BYPASS=0 still injects" "<yana-ai-priority-preservation>" "$OUT"

# 4. Hook does not read stdin at all (no `cat` of it) — must not hang or
# error when given no stdin input, matching real PreCompact invocation
# where the payload may be empty or absent.
OUT=$(bash "$HOOK" < /dev/null)
EXIT=$?
assert_exit "hook does not hang/error on empty stdin" 0 "$EXIT"
assert_contains "hook still injects with empty stdin" "<yana-ai-priority-preservation>" "$OUT"

echo ""
echo "=== Results: $TESTS_PASSED passed, $TESTS_FAILED failed ==="
[[ $TESTS_FAILED -eq 0 ]] && exit 0 || exit 1

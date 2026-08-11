#!/usr/bin/env bash
# Tests the Cursor bridge for the watcher-owned GIAMTHI_HALT.lock.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
HOOK="$REPO_ROOT/core/adapters/cursor/giamthi-halt-check.js"
HOOKS_JSON="$REPO_ROOT/.cursor/hooks.json"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEMP_ROOT"' EXIT

TESTS_PASSED=0
TESTS_FAILED=0

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  shift
  printf '    %s\n' "$@"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

run_case() {
  local name="$1" expected_permission="$2" expected_text="$3" event="${4:-}"
  local stdout exit_code=0 permission

  stdout=$(printf '%s' '{"command":"echo safe"}' | \
    CURSOR_PROJECT_DIR="$TEMP_ROOT" CURSOR_HOOK_EVENT="$event" node "$HOOK" 2>&1) || exit_code=$?
  permission=$(printf '%s' "$stdout" | jq -r '.permission // ""' 2>/dev/null || true)

  if [[ "$exit_code" -eq 0 && "$permission" == "$expected_permission" \
        && ( -z "$expected_text" || "$stdout" == *"$expected_text"* ) ]]; then
    pass "$name"
  else
    fail "$name" \
      "expected permission=$expected_permission contains=[$expected_text]" \
      "actual exit=$exit_code stdout=$stdout"
  fi
}

echo "=== core/adapters/cursor/giamthi-halt-check.js ==="
echo ""

mkdir -p "$TEMP_ROOT/.claude/state"
run_case "missing lock allows the Cursor event" "allow" ""

printf '%s\n' 'manual halt for Cursor regression' > "$TEMP_ROOT/.claude/state/GIAMTHI_HALT.lock"
run_case "shared Claude-state lock denies the Cursor event" "deny" "manual halt for Cursor regression"

rm -f "$TEMP_ROOT/.claude/state/GIAMTHI_HALT.lock"

printf '%s\n' '{"schema_version":1,"mode":"no-shell","reason":"test","actor":"human","created_at":"2026-01-01T00:00:00Z"}' > "$TEMP_ROOT/.claude/state/GIAMTHI_QUARANTINE.json"
run_case "no-shell quarantine denies Cursor shell execution" "deny" "no-shell" "beforeShellExecution"
run_case "no-shell quarantine allows Cursor file reads" "allow" "" "beforeReadFile"
run_case "missing Cursor event fails closed during quarantine" "deny" "no-shell" ""
rm -f "$TEMP_ROOT/.claude/state/GIAMTHI_QUARANTINE.json"

mkdir "$TEMP_ROOT/.claude/state/GIAMTHI_HALT.lock"
run_case "non-regular lock fails closed" "deny" "invalid halt lock"
rmdir "$TEMP_ROOT/.claude/state/GIAMTHI_HALT.lock"

printf '%s\n' 'symlink target' > "$TEMP_ROOT/elsewhere"
ln -s "$TEMP_ROOT/elsewhere" "$TEMP_ROOT/.claude/state/GIAMTHI_HALT.lock"
run_case "symlink lock fails closed" "deny" "invalid halt lock"
rm -f "$TEMP_ROOT/.claude/state/GIAMTHI_HALT.lock"

if cmp -s "$HOOK" "$REPO_ROOT/.cursor/hooks/giamthi-halt-check.js"; then
  pass "installed Cursor hook matches its canonical adapter"
else
  fail "installed Cursor hook matches its canonical adapter" "files differ"
fi

events=(beforeShellExecution beforeMCPExecution beforeReadFile beforeSubmitPrompt)
for event in "${events[@]}"; do
  count=$(jq --arg event "$event" \
    '[.hooks[$event][]? | select(.command == ".cursor/hooks/giamthi-halt-check.js" and .failClosed == true)] | length' \
    "$HOOKS_JSON")
  if [[ "$count" -eq 1 ]]; then
    pass "hooks.json wires halt enforcement exactly once for $event"
  else
    fail "hooks.json wires halt enforcement exactly once for $event" "found count=$count"
  fi
done

shell_guard_count=$(jq \
  '[.hooks.beforeShellExecution[]? | select(.command == ".cursor/hooks/before-shell-execution.js" and .failClosed == true)] | length' \
  "$HOOKS_JSON")
if [[ "$shell_guard_count" -eq 1 ]]; then
  pass "existing destructive shell guard remains wired"
else
  fail "existing destructive shell guard remains wired" "found count=$shell_guard_count"
fi

echo ""
echo "=== Summary ==="
echo "Total tests: $((TESTS_PASSED + TESTS_FAILED))"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
if [[ $TESTS_FAILED -gt 0 ]]; then
  echo -e "${RED}Failed: $TESTS_FAILED${NC}"
  exit 1
fi
echo "Failed: 0"
echo -e "${GREEN}Result: PASS${NC}"

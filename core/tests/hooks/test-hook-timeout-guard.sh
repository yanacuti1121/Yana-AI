#!/usr/bin/env bash
# Test suite for hook-timeout-guard.sh's missing-guarded-hook fail-loud fix
# (2026-09-06).
#
# Regression covered: when YANA_GUARDED_HOOK pointed at a missing/unreadable
# script, the guard used to `exit 0` with zero log line and zero stderr
# output. Since this script wraps every deny-capable hook in
# .claude/settings.json (guard-destructive.sh, tool-proxy-enforcer.sh,
# giamthi-halt-check.sh, per-tool-circuit-breaker.sh, etc.), a single wrong
# path silently disabled that entire guard with no trace anywhere. This
# fixes visibility only — the pass-through (fail-open) behavior itself is
# unchanged; see the inline comment in hook-timeout-guard.sh for why
# fail-closed is a separate, deferred change.
#
# Run: bash core/tests/hooks/test-hook-timeout-guard.sh

set -uo pipefail

TESTS_PASSED=0
TESTS_FAILED=0
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HOOKS_DIR="$PROJECT_DIR/core/hooks"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; TESTS_PASSED=$((TESTS_PASSED + 1)); }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; TESTS_FAILED=$((TESTS_FAILED + 1)); }

run_in_sandbox() {
  local tmp_project
  tmp_project=$(mktemp -d)
  mkdir -p "$tmp_project/.claude/state"
  echo "$tmp_project"
}

echo "=== hook-timeout-guard.sh (2026-09-06 missing-hook fail-loud fix) ==="
echo ""

# Test 1: missing guarded hook still exits 0 (pass-through unchanged).
SANDBOX=$(run_in_sandbox)
LOG_FILE="$SANDBOX/.claude/state/hook-timeouts.log"
STDERR_OUT=$(mktemp)
echo '{"tool_name":"Bash"}' | CLAUDE_PROJECT_DIR="$SANDBOX" YANA_GUARDED_HOOK="$SANDBOX/does-not-exist.sh" \
  bash "$HOOKS_DIR/hook-timeout-guard.sh" >/dev/null 2>"$STDERR_OUT"
EXIT_CODE=$?
if [[ "$EXIT_CODE" == "0" ]]; then
  pass "missing guarded hook still exits 0 (fail-open behavior preserved)"
else
  fail "missing guarded hook still exits 0 — got exit=$EXIT_CODE"
fi

# Test 2: missing guarded hook now writes a discoverable log line.
if [[ -f "$LOG_FILE" ]] && grep -q '"action":"hook-missing"' "$LOG_FILE"; then
  pass "missing guarded hook writes a hook-missing log entry"
else
  fail "missing guarded hook writes a hook-missing log entry — log: $(cat "$LOG_FILE" 2>/dev/null || echo 'no log file')"
fi

# Test 3: missing guarded hook now warns loudly on stderr (never silent).
if grep -q "guarded hook not found or unreadable" "$STDERR_OUT"; then
  pass "missing guarded hook warns loudly on stderr"
else
  fail "missing guarded hook warns loudly on stderr — stderr: $(cat "$STDERR_OUT")"
fi
rm -f "$STDERR_OUT"
rm -rf "$SANDBOX"

# Test 4: existing, readable guarded hook still runs normally (no false
# "hook-missing" log entry, no spurious warning).
SANDBOX=$(run_in_sandbox)
LOG_FILE="$SANDBOX/.claude/state/hook-timeouts.log"
INNER_HOOK="$SANDBOX/inner-allow.sh"
cat > "$INNER_HOOK" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$INNER_HOOK"
echo '{"tool_name":"Bash"}' | CLAUDE_PROJECT_DIR="$SANDBOX" YANA_GUARDED_HOOK="$INNER_HOOK" \
  bash "$HOOKS_DIR/hook-timeout-guard.sh" >/dev/null 2>/dev/null
EXIT_CODE=$?
if [[ "$EXIT_CODE" == "0" ]] && { [[ ! -f "$LOG_FILE" ]] || ! grep -q '"action":"hook-missing"' "$LOG_FILE"; }; then
  pass "existing guarded hook runs normally, no false hook-missing entry"
else
  fail "existing guarded hook runs normally — exit=$EXIT_CODE log=$(cat "$LOG_FILE" 2>/dev/null || echo none)"
fi
rm -rf "$SANDBOX"

# Test 5: YANA_TIMEOUT_BYPASS=1 still short-circuits before the missing-hook
# check even runs (bypass takes priority over everything).
SANDBOX=$(run_in_sandbox)
LOG_FILE="$SANDBOX/.claude/state/hook-timeouts.log"
echo '{"tool_name":"Bash"}' | CLAUDE_PROJECT_DIR="$SANDBOX" YANA_GUARDED_HOOK="$SANDBOX/does-not-exist.sh" \
  YANA_TIMEOUT_BYPASS=1 bash "$HOOKS_DIR/hook-timeout-guard.sh" >/dev/null 2>/dev/null
EXIT_CODE=$?
if [[ "$EXIT_CODE" == "0" ]] && [[ ! -f "$LOG_FILE" ]]; then
  pass "YANA_TIMEOUT_BYPASS=1 short-circuits before missing-hook check"
else
  fail "YANA_TIMEOUT_BYPASS=1 short-circuits before missing-hook check — exit=$EXIT_CODE log_exists=$( [[ -f "$LOG_FILE" ]] && echo yes || echo no)"
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

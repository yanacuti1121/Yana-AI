#!/usr/bin/env bash
# Test suite for core/adapters/cursor/before-shell-execution.js — the
# Cursor beforeShellExecution -> guard-destructive.sh bridge.
#
# Every case here pipes the exact documented Cursor input JSON shape into
# the real translator and asserts on the real stdout/exit code, exercising
# the genuine guard-destructive.sh subprocess end-to-end (including its
# real yana-rt fast path if present). This is the closest to a live-Cursor
# test achievable without live Cursor access — see
# core/adapters/cursor/before-shell-execution.js's header and
# core/rules/54-bft-consensus-law.md's review of this file for the parts
# that remain genuinely untestable without it (message rendering in
# Cursor's UI, whether failClosed:true actually fires for
# beforeShellExecution specifically).
#
# Run: bash core/tests/adapters/cursor/test-before-shell-execution.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
HOOK="$REPO_ROOT/core/adapters/cursor/before-shell-execution.js"

TESTS_PASSED=0
TESTS_FAILED=0

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Runs the translator with a given stdin payload and environment, then
# asserts exit code and (optionally) a substring expected somewhere in
# stdout. $3/$4 are extra "KEY=VALUE" env assignments applied only for
# this one invocation (word-split intentionally — always literal, never
# from external input).
run_case() {
  local name="$1" input="$2" expected_exit="$3" expect_contains="$4"
  shift 4
  local extra_env=("$@")

  local actual_stdout actual_exit=0
  actual_stdout=$(printf '%s' "$input" | env "${extra_env[@]}" node "$HOOK" 2>/dev/null) || actual_exit=$?

  local ok=1
  if [[ "$actual_exit" != "$expected_exit" ]]; then
    ok=0
  fi
  if [[ -n "$expect_contains" ]] && [[ "$actual_stdout" != *"$expect_contains"* ]]; then
    ok=0
  fi

  if [[ "$ok" == "1" ]]; then
    echo -e "${GREEN}✓ PASS${NC}: $name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}✗ FAIL${NC}: $name"
    echo "    expected exit=$expected_exit contains=[$expect_contains]"
    echo "    actual   exit=$actual_exit stdout=$actual_stdout"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

echo "=== core/adapters/cursor/before-shell-execution.js ==="
echo ""

# 1. Genuinely destructive command -> deny, forwarding guard-destructive.sh's
#    own literal reason text (proves no reimplementation happened here).
run_case \
  "destructive command denied with guard's own reason" \
  '{"command":"rm -rf /tmp/definitely-not-real-xyz"}' \
  "0" \
  "'rm -rf' (recursive + force, any flag spelling) is irreversible" \
  "CURSOR_PROJECT_DIR=$REPO_ROOT"

# 2. Benign command -> allow.
run_case \
  "benign command allowed" \
  '{"command":"ls -la"}' \
  "0" \
  '{"permission":"allow"}' \
  "CURSOR_PROJECT_DIR=$REPO_ROOT"

# 3. Malformed JSON input -> deny, failing closed (uses ((( instead of
#    {{{ so this test file's own content can't be mistaken for a
#    brace-expansion-adjacent-to-rm pattern by guard-destructive.sh
#    itself when this script is reviewed/run).
run_case \
  "malformed JSON input fails closed" \
  'not-json-at-all(((' \
  "0" \
  "malformed input" \
  "CURSOR_PROJECT_DIR=$REPO_ROOT"

# 4. guard-destructive.sh missing from the resolved project root -> deny,
#    naming the path it looked for.
FAKE_ROOT="$(mktemp -d)"
JQ_LESS_BIN_DIR="$(mktemp -d)"
trap 'rm -rf "$FAKE_ROOT" "$JQ_LESS_BIN_DIR"' EXIT
run_case \
  "missing guard-destructive.sh fails closed" \
  '{"command":"ls"}' \
  "0" \
  "$FAKE_ROOT/core/hooks/guard-destructive.sh" \
  "CURSOR_PROJECT_DIR=$FAKE_ROOT"

# 5. guard-destructive.sh's OWN internal fail-closed path (jq missing) --
#    exercised end to end, proving the translator forwards ANY deny
#    guard-destructive.sh produces, not just a hardcoded "destructive
#    command" case. A naive PATH trim to just bash+node's directories
#    isn't precise enough: jq happens to live in the same directory
#    (/usr/bin on this machine) as awk, which guard-destructive.sh also
#    needs, so trimming PATH down that far breaks the script for an
#    unrelated reason (awk: command not found, a different exit-status
#    path) rather than exercising the jq-specific check. Instead: symlink
#    every currently-resolvable executable except jq into one scratch
#    directory (first-found-in-PATH wins per executable name, same as
#    real PATH resolution order) and use ONLY that directory as PATH --
#    everything guard-destructive.sh needs stays available except jq.
IFS=':' read -ra _path_dirs <<< "$PATH"
for dir in "${_path_dirs[@]}"; do
  [[ -d "$dir" ]] || continue
  for bin in "$dir"/*; do
    [[ -x "$bin" && -f "$bin" ]] || continue
    name="$(basename "$bin")"
    [[ "$name" == "jq" || "$name" == "yana-rt" ]] && continue
    [[ -e "$JQ_LESS_BIN_DIR/$name" ]] && continue
    ln -s "$bin" "$JQ_LESS_BIN_DIR/$name" 2>/dev/null || true
  done
done
unset _path_dirs
run_case \
  "guard-destructive.sh's own jq-missing fail-closed is forwarded" \
  '{"command":"ls"}' \
  "0" \
  "requires \`jq\` but it is not installed" \
  "CURSOR_PROJECT_DIR=$REPO_ROOT" "PATH=$JQ_LESS_BIN_DIR"

# 6. Static check: the translator must contain zero destructive-pattern
#    detection logic of its own -- guard-destructive.sh is the only
#    source of truth. A match here means the standing design decision was
#    violated somewhere in this file. Word-boundary anchored (\b...\b) --
#    an earlier unanchored version of this check matched "force" as a
#    substring of the unrelated word "enforcement", which this file's
#    surrounding theme uses throughout, making the check false-positive on
#    innocuous prose rather than actual reimplementation. Comment-only
#    lines (grep -n output starting "N: //", allowing leading whitespace)
#    are excluded from the scan for the same reason: this file's own
#    header/inline comments legitimately name example destructive commands
#    ("rm -rf", "force-push") while EXPLAINING the design, which isn't
#    reimplementing detection -- the check's actual purpose is catching
#    live pattern-matching CODE, not prose that discusses the topic.
NO_REIMPL_PATTERN='\bforce\b|\brecursive\b|\bDROP\b|\bTRUNCATE\b|--hard\b'
echo ""
_reimpl_hits=$(grep -nE "$NO_REIMPL_PATTERN" "$HOOK" | grep -vE '^[0-9]+: *//' || true)
if [[ -n "$_reimpl_hits" ]]; then
  echo -e "${RED}✗ FAIL${NC}: no-reimplementation static check — found destructive-pattern text in the translator's code (not just comments)"
  printf '%s\n' "$_reimpl_hits"
  TESTS_FAILED=$((TESTS_FAILED + 1))
else
  echo -e "${GREEN}✓ PASS${NC}: no-reimplementation static check — translator contains no destructive-pattern logic of its own"
  TESTS_PASSED=$((TESTS_PASSED + 1))
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

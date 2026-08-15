#!/usr/bin/env bash
# PostToolUse: Write|Edit|MultiEdit
# Detects test framework and runs tests related to modified file. Blocks on failure.
#
# BUG FIX (found live-testing before wiring, 2026-08-15): same class of bug
# as the other hooks fixed in this batch — read invented env vars instead
# of the real stdin JSON payload. Fixed to match the proven
# `INPUT=$(cat)` + jq pattern; old code always exited 0 without ever
# running a test.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)

[[ "$TOOL_NAME" =~ ^(Write|Edit|MultiEdit)$ ]] || exit 0
[[ -n "$FILE_PATH" && -f "$FILE_PATH" ]] || exit 0

# Skip test files themselves and non-source files
EXT="${FILE_PATH##*.}"
[[ "$EXT" =~ ^(py|ts|tsx|js|jsx|go|rs)$ ]] || exit 0
BASENAME=$(basename "$FILE_PATH")
[[ "$BASENAME" =~ (test|spec|_test) ]] && exit 0  # is a test file — skip

TIMEOUT=60  # max seconds for test run

find_related_tests() {
    local src="$1"
    local base="${src%.*}"
    local dir
    dir=$(dirname "$src")
    local name
    name=$(basename "$base")

    # Look for co-located test files
    for pattern in \
        "${base}.test.${EXT}" \
        "${base}.spec.${EXT}" \
        "${dir}/__tests__/${name}.test.${EXT}" \
        "${dir}/__tests__/${name}.spec.${EXT}" \
        "${dir}/tests/test_${name}.${EXT}" \
        "${dir}/test_${name}.${EXT}"; do
        [[ -f "$pattern" ]] && echo "$pattern" && return
    done

    # Python: tests/ sibling directory
    if [[ "$EXT" == "py" ]]; then
        local testfile
        testfile=$(find . -name "test_${name}.py" -not -path "*/node_modules/*" 2>/dev/null | head -1)
        [[ -n "$testfile" ]] && echo "$testfile"
    fi

    # BUG FIX (found live-testing before wiring, 2026-08-15): without an
    # explicit `return 0` here, this function's own exit status was
    # whatever `[[ -n "$testfile" ]]` last evaluated to — false (1) on the
    # common case of "no related test found". Under `set -e`, a non-zero
    # status from a function called as `VAR=$(fn ...)` aborts the whole
    # script immediately, before the caller's own
    # `[[ -z "$RELATED_TEST" ]] && exit 0` early-exit ever ran. Reproduced
    # live: editing a .py file with no test file present crashed this
    # hook with exit 1 (an unintended, unlabeled failure — not this
    # codebase's exit-0-allow/exit-2-deny convention) instead of the
    # intended silent skip.
    return 0
}

# BUG FIX (found live-testing before wiring, 2026-08-15): both test
# runners below used bare `timeout "$TIMEOUT" <cmd>`. macOS ships neither
# `timeout` nor `gtimeout` by default — confirmed absent on this machine
# — and this exact gap is already documented and fixed in this same
# directory's hook-timeout-guard.sh (2026-07-04 BUG FIX comment there):
# `timeout N cmd` is parsed as ONE command, so when `timeout` itself is
# missing, NONE of it runs and the shell reports "command not found"
# (exit 127) as the failure — which `|| FAILED=true` / `|| return 1`
# below then reads as "the tests failed". Reproduced live: a co-located
# test with a genuinely failing assertion correctly reported BLOCK, but
# for the wrong reason — pytest never actually ran, `timeout` itself was
# what failed. Net effect on this machine: this hook would report every
# single edit as a test failure, always, even for source changes with
# zero relation to the test outcome. Fixed with the same
# `command -v timeout || command -v gtimeout || true` fallback
# hook-timeout-guard.sh already established, running without the time
# cap in degraded mode rather than failing shut — this hook's timeout is
# a safety cap on run duration, not a security boundary, so degrading
# gracefully is the correct trade-off here (contrast hook-timeout-guard.sh
# itself, where the same gap is more consequential).
TIMEOUT_BIN="$(command -v timeout || command -v gtimeout || true)"

run_python_tests() {
    local testfile="$1"
    if command -v pytest &>/dev/null; then
        if [[ -n "$TIMEOUT_BIN" ]]; then
            OUTPUT=$("$TIMEOUT_BIN" "$TIMEOUT" pytest "$testfile" -q --tb=short 2>&1) || FAILED=true
        else
            OUTPUT=$(pytest "$testfile" -q --tb=short 2>&1) || FAILED=true
        fi
        echo "$OUTPUT"
        ${FAILED:-false} && return 1
    fi
    return 0
}

run_js_tests() {
    local testfile="$1"
    if [[ -f "package.json" ]]; then
        if command -v vitest &>/dev/null; then
            if [[ -n "$TIMEOUT_BIN" ]]; then
                OUTPUT=$("$TIMEOUT_BIN" "$TIMEOUT" vitest run "$testfile" 2>&1) || return 1
            else
                OUTPUT=$(vitest run "$testfile" 2>&1) || return 1
            fi
            echo "$OUTPUT"
        elif command -v jest &>/dev/null; then
            if [[ -n "$TIMEOUT_BIN" ]]; then
                OUTPUT=$("$TIMEOUT_BIN" "$TIMEOUT" jest "$testfile" --passWithNoTests 2>&1) || return 1
            else
                OUTPUT=$(jest "$testfile" --passWithNoTests 2>&1) || return 1
            fi
            echo "$OUTPUT"
        fi
    fi
    return 0
}

RELATED_TEST=$(find_related_tests "$FILE_PATH")
[[ -z "$RELATED_TEST" ]] && exit 0  # No test found — skip silently

echo "[test-runner-gate] Running tests for $FILE_PATH → $RELATED_TEST" >&2

FAILED=false
case "$EXT" in
    py)
        run_python_tests "$RELATED_TEST" || FAILED=true ;;
    ts|tsx|js|jsx)
        run_js_tests "$RELATED_TEST" || FAILED=true ;;
esac

if $FAILED; then
    echo "" >&2
    echo "[test-runner-gate] BLOCK — tests failed after editing $FILE_PATH" >&2
    echo "  Fix the test failures before continuing." >&2
    exit 2
fi

echo "[test-runner-gate] PASS — tests green for $FILE_PATH" >&2
exit 0

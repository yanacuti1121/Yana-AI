#!/usr/bin/env bash
# PostToolUse: Write|Edit|MultiEdit
# Detects test framework and runs tests related to modified file. Blocks on failure.
set -euo pipefail

TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-${CLAUDE_TOOL_INPUT_PATH:-}}"

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
}

run_python_tests() {
    local testfile="$1"
    if command -v pytest &>/dev/null; then
        OUTPUT=$(timeout "$TIMEOUT" pytest "$testfile" -q --tb=short 2>&1) || FAILED=true
        echo "$OUTPUT"
        ${FAILED:-false} && return 1
    fi
    return 0
}

run_js_tests() {
    local testfile="$1"
    if [[ -f "package.json" ]]; then
        if command -v vitest &>/dev/null; then
            OUTPUT=$(timeout "$TIMEOUT" vitest run "$testfile" 2>&1) || return 1
            echo "$OUTPUT"
        elif command -v jest &>/dev/null; then
            OUTPUT=$(timeout "$TIMEOUT" jest "$testfile" --passWithNoTests 2>&1) || return 1
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

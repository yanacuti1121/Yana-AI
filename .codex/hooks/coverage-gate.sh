#!/usr/bin/env bash
# PreToolUse: Bash (git commit)
# Checks test coverage before commit. Blocks if coverage dropped > 5% vs baseline.
set -euo pipefail

TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
COMMAND="${CLAUDE_TOOL_INPUT_COMMAND:-}"

[[ "$TOOL_NAME" == "Bash" ]] || exit 0
[[ "$COMMAND" =~ git\ commit ]] || exit 0

BASELINE_FILE=".claude/state/coverage-baseline.json"
MIN_COVERAGE="${YANA_MIN_COVERAGE:-60}"
MAX_DROP=5

get_python_coverage() {
    [[ -f "setup.py" || -f "pyproject.toml" || -f "setup.cfg" ]] || return 1
    command -v pytest &>/dev/null || return 1
    OUTPUT=$(timeout 120 pytest --cov=. --cov-report=json -q --no-header 2>/dev/null) || return 1
    python3 -c "
import json
try:
    with open('coverage.json') as f:
        d=json.load(f)
    print(round(d['totals']['percent_covered'],1))
except:
    print(-1)
"
}

get_js_coverage() {
    [[ -f "package.json" ]] || return 1
    command -v vitest &>/dev/null || command -v jest &>/dev/null || return 1
    if command -v vitest &>/dev/null; then
        OUTPUT=$(timeout 120 vitest run --coverage --reporter=json 2>/dev/null) || return 1
    else
        OUTPUT=$(timeout 120 jest --coverage --coverageReporters=json-summary 2>/dev/null) || return 1
    fi
    python3 -c "
import json, glob
files=glob.glob('coverage/coverage-summary.json')
if not files: print(-1); exit()
with open(files[0]) as f:
    d=json.load(f)
t=d.get('total',{})
stmts=t.get('statements',{})
pct=stmts.get('pct',-1)
print(round(float(pct),1))
" 2>/dev/null || echo "-1"
}

load_baseline() {
    [[ -f "$BASELINE_FILE" ]] || echo "{}"
    cat "$BASELINE_FILE" 2>/dev/null || echo "{}"
}

save_baseline() {
    local coverage="$1"
    mkdir -p "$(dirname "$BASELINE_FILE")"
    echo "{\"coverage\": $coverage, \"updated\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$BASELINE_FILE"
}

# Detect project type and get coverage
COVERAGE=-1
if [[ -f "pyproject.toml" || -f "setup.py" ]]; then
    COVERAGE=$(get_python_coverage 2>/dev/null || echo "-1")
elif [[ -f "package.json" ]]; then
    COVERAGE=$(get_js_coverage 2>/dev/null || echo "-1")
fi

[[ "$COVERAGE" == "-1" || -z "$COVERAGE" ]] && exit 0  # Can't measure — skip

BASELINE=$(load_baseline | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('coverage',-1))" 2>/dev/null || echo "-1")

if [[ "$BASELINE" == "-1" ]]; then
    # First run — save baseline
    save_baseline "$COVERAGE"
    echo "[coverage-gate] Baseline set: ${COVERAGE}%" >&2
    exit 0
fi

DROP=$(python3 -c "print(round(float('$BASELINE') - float('$COVERAGE'), 1))" 2>/dev/null || echo "0")
BELOW_MIN=$(python3 -c "print(1 if float('$COVERAGE') < $MIN_COVERAGE else 0)" 2>/dev/null || echo "0")

if [[ "$BELOW_MIN" == "1" ]]; then
    echo "[coverage-gate] BLOCK — coverage ${COVERAGE}% is below minimum ${MIN_COVERAGE}%" >&2
    echo "  Write tests to reach ${MIN_COVERAGE}% coverage before committing." >&2
    exit 2
fi

TOO_LOW=$(python3 -c "print(1 if float('$DROP') > $MAX_DROP else 0)" 2>/dev/null || echo "0")
if [[ "$TOO_LOW" == "1" ]]; then
    echo "[coverage-gate] BLOCK — coverage dropped ${DROP}% (${BASELINE}% → ${COVERAGE}%)" >&2
    echo "  Max allowed drop: ${MAX_DROP}%. Add tests to recover coverage." >&2
    exit 2
fi

# Update baseline on success
save_baseline "$COVERAGE"
echo "[coverage-gate] PASS — coverage ${COVERAGE}% (baseline ${BASELINE}%, drop ${DROP}%)" >&2
exit 0

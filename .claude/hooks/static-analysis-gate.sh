#!/usr/bin/env bash
# PostToolUse: Write|Edit|MultiEdit
# Runs static type analysis after code changes. Blocks on type errors.
set -euo pipefail

TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-${CLAUDE_TOOL_INPUT_PATH:-}}"

[[ "$TOOL_NAME" =~ ^(Write|Edit|MultiEdit)$ ]] || exit 0
[[ -n "$FILE_PATH" && -f "$FILE_PATH" ]] || exit 0

EXT="${FILE_PATH##*.}"

run_pyright() {
    if command -v pyright &>/dev/null; then
        OUTPUT=$(pyright "$FILE_PATH" --outputjson 2>/dev/null) || true
        ERRORS=$(echo "$OUTPUT" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    errs=[e for e in d.get('generalDiagnostics',[]) if e['severity']=='error']
    print(len(errs))
except:
    print(0)
" 2>/dev/null || echo "0")
        if [[ "$ERRORS" -gt 0 ]]; then
            echo "[static-analysis-gate] BLOCK — pyright: $ERRORS type error(s) in $FILE_PATH" >&2
            echo "$OUTPUT" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    for e in d.get('generalDiagnostics',[]):
        if e['severity']=='error':
            r=e.get('range',{})
            ln=r.get('start',{}).get('line',0)+1
            print(f'  line {ln}: {e[\"message\"]}')
except:
    pass
" >&2
            exit 2
        fi
    elif command -v mypy &>/dev/null; then
        OUTPUT=$(mypy "$FILE_PATH" --no-error-summary --ignore-missing-imports 2>&1) || true
        ERRORS=$(echo "$OUTPUT" | grep -c ": error:" || true)
        if [[ "$ERRORS" -gt 0 ]]; then
            echo "[static-analysis-gate] BLOCK — mypy: $ERRORS type error(s) in $FILE_PATH" >&2
            echo "$OUTPUT" | grep ": error:" | head -10 >&2
            exit 2
        fi
    fi
}

run_eslint_strict() {
    if command -v eslint &>/dev/null; then
        OUTPUT=$(eslint "$FILE_PATH" --format json 2>/dev/null) || true
        ERRORS=$(echo "$OUTPUT" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    total=sum(f.get('errorCount',0) for f in d)
    print(total)
except:
    print(0)
" 2>/dev/null || echo "0")
        if [[ "$ERRORS" -gt 0 ]]; then
            echo "[static-analysis-gate] BLOCK — eslint: $ERRORS error(s) in $FILE_PATH" >&2
            echo "$OUTPUT" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    for f in d:
        for m in f.get('messages',[]):
            if m.get('severity',0)==2:
                print(f'  line {m.get(\"line\",0)}: [{m.get(\"ruleId\",\"?\")}] {m.get(\"message\",\"\")}')
except:
    pass
" 2>&1 | head -15 >&2
            exit 2
        fi
    fi
}

case "$EXT" in
    py)   run_pyright ;;
    ts|tsx) run_eslint_strict ;;
    js|jsx) run_eslint_strict ;;
esac

exit 0

#!/usr/bin/env bash
# code-quality-gate.sh — PostToolUse hook
# Fires after every Write/Edit tool call.
# Scans written code for AI-generated anti-patterns.
# Gate: L2.5 — Code Quality

set -euo pipefail

TOOL_NAME="${TOOL_NAME:-}"
TOOL_INPUT="${TOOL_INPUT:-}"

# Only check Write and Edit tool calls
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Extract file path from tool input JSON
FILE_PATH=$(echo "$TOOL_INPUT" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  print(d.get('file_path', ''))
except:
  print('')
" 2>/dev/null)

if [[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# Only check code files
EXT="${FILE_PATH##*.}"
CODE_EXTS="py ts tsx js jsx sh bash go rs java kt swift"
IS_CODE=false
for e in $CODE_EXTS; do
  [[ "$EXT" == "$e" ]] && IS_CODE=true && break
done

[[ "$IS_CODE" == "false" ]] && exit 0

SCORE=100
VIOLATIONS=()

check_pattern() {
  local desc="$1"
  local pattern="$2"
  local penalty="$3"
  local lang_filter="${4:-}"  # optional: only check if ext matches

  if [[ -n "$lang_filter" && "$EXT" != $lang_filter ]]; then
    return
  fi

  if grep -qP "$pattern" "$FILE_PATH" 2>/dev/null; then
    SCORE=$((SCORE - penalty))
    VIOLATIONS+=("[-${penalty}] $desc")
  fi
}

# ── Python anti-patterns ─────────────────────────────────────────────────────
check_pattern "Bare except (swallows all errors)" \
  '^\s*except\s*:' 20 "py"

check_pattern "except Exception pass (silent failure)" \
  'except\s+Exception[^:]*:\s*\n\s*pass' 20 "py"

check_pattern "print() in production code (use logging)" \
  '^\s*print\s*\(' 10 "py"

check_pattern "No type hints on function def" \
  'def \w+\([^)]*\)\s*:' 5 "py"

# ── TypeScript/JS anti-patterns ──────────────────────────────────────────────
check_pattern "any type (disables type safety)" \
  ':\s*any\b' 15 "ts tsx"

check_pattern "console.log in production code" \
  'console\.log\(' 8 "ts tsx js jsx"

check_pattern "Uncaught promise (.catch() missing)" \
  '\.\bthen\b[^;]*;(?!\s*\.)' 10 "ts tsx js jsx"

check_pattern "Empty catch block" \
  'catch\s*\([^)]*\)\s*\{\s*\}' 20 "ts tsx js jsx"

# ── Universal anti-patterns ───────────────────────────────────────────────────
check_pattern "TODO/FIXME left in code" \
  '(TODO|FIXME|HACK|XXX):' 5

check_pattern "Hardcoded IP address" \
  '\b(?:\d{1,3}\.){3}\d{1,3}\b' 15

check_pattern "Hardcoded localhost URL" \
  'http://localhost|127\.0\.0\.1' 8

check_pattern "Magic number (unexplained numeric literal)" \
  '[^a-zA-Z_](60|300|1000|9999|99999|86400)[^0-9]' 3

check_pattern "sleep/time.sleep without comment" \
  '(time\.sleep|await sleep|setTimeout)\([0-9]' 5

check_pattern "Hardcoded secret pattern" \
  '(api_key|API_KEY|secret|password|token)\s*=\s*["\x27][a-zA-Z0-9+/]{8,}' 30

check_pattern "Catch-all error ignored (pass/continue/return None silently)" \
  'except.*:\s*\n\s*(pass|return None|continue)' 15 "py"

check_pattern "Mutable default argument (Python classic bug)" \
  'def \w+\([^)]*=\s*[\[{]' 10 "py"

check_pattern "eval() call (dangerous)" \
  '\beval\s*\(' 25

check_pattern "os.system() call (use subprocess)" \
  'os\.system\s*\(' 15 "py"

# ── Emit result ───────────────────────────────────────────────────────────────
if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  exit 0
fi

echo ""
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│  yana-ai/code-quality-gate — PostToolUse scan                │"
echo "│  File: $FILE_PATH"
echo "│  Score: $SCORE / 100"
echo "├─────────────────────────────────────────────────────────────┤"
for v in "${VIOLATIONS[@]}"; do
  echo "│  ⚠  $v"
done
echo "└─────────────────────────────────────────────────────────────┘"

if [[ $SCORE -lt 50 ]]; then
  echo ""
  echo "[code-quality-gate] BLOCK — score $SCORE/100 is below minimum (50)."
  echo "Fix the violations above before continuing. This code is not production-safe."
  exit 2
elif [[ $SCORE -lt 70 ]]; then
  echo ""
  echo "[code-quality-gate] WARN — score $SCORE/100. Address violations before committing."
  exit 0
else
  echo ""
  echo "[code-quality-gate] WARN — score $SCORE/100. Minor issues noted."
  exit 0
fi

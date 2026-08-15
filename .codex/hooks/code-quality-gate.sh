#!/usr/bin/env bash
# code-quality-gate.sh — PostToolUse hook
# Fires after every Write/Edit tool call.
# Scans written code for AI-generated anti-patterns.
# Gate: L2.5 — Code Quality
#
# BUG FIX (found live-testing before wiring, 2026-08-15): this read
# `TOOL_NAME`/`TOOL_INPUT` as bare environment variables. Claude Code never
# sets these — it delivers the hook payload as JSON on stdin (confirmed
# against every proven-working hook already wired in this directory, e.g.
# verify-evidence-track.sh's `INPUT=$(cat)` + `jq -r '.tool_name // ""'`).
# With the old code, `$TOOL_NAME` was always empty, so this hook always hit
# the `!= "Write" && != "Edit"` branch and exited 0 immediately on every
# call — it never once actually scanned a file. Fixed by reading stdin once
# and extracting both fields via jq, matching that proven pattern; also
# replaced the python3 JSON-parse subprocess for FILE_PATH with the same jq
# call already needed for TOOL_NAME, removing a python3 dependency this file
# never declared.

set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)

# Only check Write and Edit tool calls
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)

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

command -v python3 >/dev/null 2>&1 || exit 0

SCORE=100
VIOLATIONS=()

# BUG FIX (found live-testing before wiring, 2026-08-15): every pattern in
# this file is PCRE (`\s`, `\w`, `\d`, `\b`, `(?:...)`, one `(?!...)`
# negative lookahead) and was matched with `grep -qP`. Traced with `bash
# -x` why a file with an obvious bare `except:` scored a clean 100 with
# zero violations: the `grep -qP` invocation itself was failing — on this
# machine, the `grep` a hook subprocess actually resolves (`/usr/bin/grep`,
# real BSD grep) has no `-P` flag at all ("invalid option -- P", exit 2),
# so `if grep -qP ...; then` was false on every single call regardless of
# whether the pattern would have matched. This is the exact same
# `-P`-unsupported-on-this-machine class of bug independently confirmed in
# tool-validator.sh earlier this session (there by the security-auditor
# dispatch), not a new discovery method. (The `-P` support I saw in an
# interactive terminal test earlier came from a `grep` shell *function*
# loaded by this Claude Code session's own zsh snapshot — not present in
# the plain subprocess environment a hook actually runs in.)
# Fixed by matching with python3's `re` module instead of rewriting 14
# patterns to POSIX ERE by hand: the patterns are already valid Python
# regex syntax as-is (no translation risk), and one of them structurally
# cannot be expressed in ERE at all (the negative lookahead on the
# uncaught-promise check), so a regex-engine swap is the only fix that
# doesn't drop that check's semantics. Reads the whole file once and uses
# `re.MULTILINE` so `^`/`$` still anchor per-line like grep did — and, as
# a side effect, the two patterns containing a literal `\n` (which could
# never have matched grep's per-line buffer even with `-P` fixed) now
# actually work instead of being silently unreachable.
check_pattern() {
  local desc="$1"
  local pattern="$2"
  local penalty="$3"
  local lang_filter="${4:-}"  # optional: space-separated list of exts, e.g. "ts tsx"

  # BUG FIX (found by independent code-auditor review, 2026-08-15): the old
  # `[[ -n "$lang_filter" && "$EXT" != $lang_filter ]]` compared $EXT against
  # the ENTIRE unquoted multi-word string as one glob pattern (bash word
  # splitting doesn't apply on the RHS of `!=` inside `[[ ]]`), which a
  # single extension can never equal. Confirmed live: `EXT="ts";
  # lang_filter="ts tsx"; [[ "$EXT" != $lang_filter ]]` evaluates true (a
  # mismatch) even though "ts" IS one of the two intended extensions —
  # every multi-extension filter in this file ("ts tsx", "ts tsx js jsx")
  # silently disabled its checks 100% of the time; only the single-word
  # filters ("py") ever worked. Fixed by testing membership in the
  # space-separated list explicitly instead of a single glob comparison.
  if [[ -n "$lang_filter" ]]; then
    local ext_matches=false
    local candidate
    for candidate in $lang_filter; do
      [[ "$EXT" == "$candidate" ]] && ext_matches=true && break
    done
    [[ "$ext_matches" == "false" ]] && return
  fi

  if python3 -c "
import re, sys
pattern, path = sys.argv[1], sys.argv[2]
try:
    with open(path, 'r', errors='ignore') as f:
        content = f.read()
    sys.exit(0 if re.search(pattern, content, re.MULTILINE) else 1)
except Exception:
    sys.exit(1)
" "$pattern" "$FILE_PATH" 2>/dev/null; then
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
# BUG FIX (found by independent code-auditor review, 2026-08-15): this block
# printed to stdout via bare `echo`, while every sibling hook fixed in this
# same batch (coverage-gate.sh, static-analysis-gate.sh, test-runner-gate.sh,
# dependency-safety-gate.sh) routes its BLOCK/WARN output through stderr.
# Confirmed live: this hook's own real exit-2 block, tripped during this
# session's testing, surfaced to the model only as "No stderr output" — the
# reasoning never arrived. Fixed by routing every line below through `>&2`,
# matching this directory's own convention and core/hooks/CLAUDE.md's
# "hooks must fail loudly" rule.
if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  exit 0
fi

{
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
} >&2

if [[ $SCORE -lt 50 ]]; then
  {
    echo ""
    echo "[code-quality-gate] BLOCK — score $SCORE/100 is below minimum (50)."
    echo "Fix the violations above before continuing. This code is not production-safe."
  } >&2
  exit 2
elif [[ $SCORE -lt 70 ]]; then
  {
    echo ""
    echo "[code-quality-gate] WARN — score $SCORE/100. Address violations before committing."
  } >&2
  exit 0
else
  {
    echo ""
    echo "[code-quality-gate] WARN — score $SCORE/100. Minor issues noted."
  } >&2
  exit 0
fi

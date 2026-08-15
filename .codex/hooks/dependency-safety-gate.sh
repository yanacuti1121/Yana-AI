#!/usr/bin/env bash
# PostToolUse: Write|Edit
# Scans for new imports/requires in modified files. Runs pip-audit or npm audit on new deps.
#
# BUG FIX (found live-testing before wiring, 2026-08-15): read
# `CLAUDE_TOOL_NAME`/`CLAUDE_TOOL_INPUT_FILE_PATH`/`CLAUDE_TOOL_INPUT_PATH`
# as bare env vars, none of which Claude Code sets — same class of bug as
# code-quality-gate.sh and coverage-gate.sh in this same batch. Fixed to
# read stdin JSON via jq, matching every proven-working hook in this
# directory. With the old code `$TOOL_NAME` was always empty, so this hook
# exited 0 on every call and never scanned an import.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)

[[ "$TOOL_NAME" =~ ^(Write|Edit)$ ]] || exit 0
[[ -n "$FILE_PATH" && -f "$FILE_PATH" ]] || exit 0

EXT="${FILE_PATH##*.}"

# BUG FIX (found live-testing before wiring, 2026-08-15): both extraction
# functions used `grep -oP` with `\K` — a PCRE-only "keep" operator with no
# POSIX ERE equivalent at all (unlike `\s`/`\w`, which can at least be
# swapped for `[[:space:]]`/`[A-Za-z0-9_]`). Same root cause as
# code-quality-gate.sh's fix in this same batch: the `grep` a hook
# subprocess actually resolves on this machine (`/usr/bin/grep`) has no
# `-P` support at all, confirmed live ("invalid option -- P", exit 2) — so
# these two functions returned nothing on every call, and
# check_suspicious_imports() never received a single import to check.
# Fixed with python3's `re.findall` + a capture group standing in for
# `\K` (extracting group 1 instead of using the keep-operator), which
# preserves the original matching intent exactly since these patterns
# were already written in Python-compatible PCRE syntax.
extract_python_imports() {
    python3 -c "
import re, sys
try:
    with open(sys.argv[1], 'r', errors='ignore') as f:
        content = f.read()
except Exception:
    sys.exit(0)
names = sorted(set(re.findall(r'^(?:import|from)\s+(\w+)', content, re.MULTILINE)))
for n in names:
    print(n)
" "$1" 2>/dev/null
}

# BUG FIX (found by independent code-auditor review, 2026-08-15): the
# original pattern required an opening delimiter (`(`, `{`, `'`, `"`)
# immediately after import/require, then captured everything up to the
# NEXT delimiter while explicitly EXCLUDING quote characters from the
# capture — which means it could never actually match `require('pkg')` or
# `import('pkg')` (the char right after the consumed `(` is a quote, which
# the capture group then rejects) or plain `import x from 'pkg'` (import
# isn't followed by a delimiter char at all). Confirmed live: a file with
# `require('requests-http')` — a package literally on this file's own
# SUSPICIOUS_PACKAGES list — matched nothing, so check_suspicious_imports()
# never received a single import to check for any real-world JS/TS import
# style. Rewritten to capture the quoted module string directly after
# `require(`, `import(` (dynamic import), a side-effect `import '...'`, or
# `from '...'` (covers `import x from`, `import {a,b} from`, and
# `import * as x from`, since matching doesn't require import/from
# adjacency — re.findall scans the whole file content).
extract_js_imports() {
    python3 -c '
import re, sys
try:
    with open(sys.argv[1], "r", errors="ignore") as f:
        content = f.read()
except Exception:
    sys.exit(0)
pattern = r"(?:require\(|import\(|import|from)\s*[\x27\x22]([^\x27\x22]+)[\x27\x22]"
names = sorted(set(re.findall(pattern, content)))
for n in names:
    if not n.startswith("."):
        print(n)
' "$1" 2>/dev/null
}

check_requirements_txt() {
    [[ -f "requirements.txt" ]] || return 0
    if command -v pip-audit &>/dev/null; then
        OUTPUT=$(pip-audit -r requirements.txt --format json 2>/dev/null) || true
        VULNS=$(echo "$OUTPUT" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    total=sum(len(p.get('vulns',[])) for p in d.get('dependencies',[]))
    print(total)
except:
    print(0)
" 2>/dev/null || echo "0")
        if [[ "$VULNS" -gt 0 ]]; then
            echo "[dependency-safety-gate] WARN — $VULNS vulnerability(ies) found in requirements.txt" >&2
            echo "$OUTPUT" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    for p in d.get('dependencies',[]):
        for v in p.get('vulns',[]):
            print(f'  {p[\"name\"]}=={p[\"version\"]}: {v[\"id\"]} ({v.get(\"fix_versions\",[\"no fix\"])})')
except:
    pass
" >&2
        fi
    fi
}

check_package_json() {
    [[ -f "package.json" ]] || return 0
    if command -v npm &>/dev/null; then
        OUTPUT=$(npm audit --json 2>/dev/null) || true
        CRITICAL=$(echo "$OUTPUT" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    m=d.get('metadata',{}).get('vulnerabilities',{})
    print(m.get('critical',0)+m.get('high',0))
except:
    print(0)
" 2>/dev/null || echo "0")
        if [[ "$CRITICAL" -gt 0 ]]; then
            echo "[dependency-safety-gate] WARN — $CRITICAL critical/high npm vulnerabilities found" >&2
            echo "  Run: npm audit fix" >&2
        fi
    fi
}

SUSPICIOUS_PACKAGES=(
    "requests-http" "python-requests" "node-fetch-http"
    "colorama2" "setuptool" "pipsinstall"
    "node-loggers" "react-dom2"
)

check_suspicious_imports() {
    local imports=("$@")
    for pkg in "${imports[@]}"; do
        for suspicious in "${SUSPICIOUS_PACKAGES[@]}"; do
            if [[ "$pkg" == "$suspicious" ]]; then
                echo "[dependency-safety-gate] BLOCK — suspicious package name: $pkg (possible typosquat)" >&2
                exit 2
            fi
        done
        # Flag single-letter or very short package names
        if [[ ${#pkg} -le 2 && "$pkg" =~ ^[a-z]+$ ]]; then
            echo "[dependency-safety-gate] WARN — unusually short package name: $pkg" >&2
        fi
    done
}

# BUG FIX (found live-testing before wiring, 2026-08-15): `mapfile` is a
# bash-4+ builtin. Confirmed live that a hook subprocess on this machine
# runs under bash 3.2.57 (macOS's system `/bin/bash`, resolved via
# `#!/usr/bin/env bash` — there is no newer bash on PATH in that
# environment), where `mapfile` doesn't exist at all ("command not
# found", exit 127) — this crashed the hook outright on every .py/.ts/.js
# write. Same bash-3.2-on-macOS gotcha this codebase already documents in
# supply-chain-guard.sh's own comments (there for `declare -A`). Fixed
# with a portable `while read` loop into the array instead — process
# substitution (`< <(...)`) is a much older bash feature than `mapfile`
# and works fine under 3.2.
case "$EXT" in
    py)
        IMPORTS=()
        while IFS= read -r line; do
            [[ -n "$line" ]] && IMPORTS+=("$line")
        done < <(extract_python_imports "$FILE_PATH")
        [[ ${#IMPORTS[@]} -gt 0 ]] && check_suspicious_imports "${IMPORTS[@]}"
        check_requirements_txt
        ;;
    ts|tsx|js|jsx)
        IMPORTS=()
        while IFS= read -r line; do
            [[ -n "$line" ]] && IMPORTS+=("$line")
        done < <(extract_js_imports "$FILE_PATH")
        [[ ${#IMPORTS[@]} -gt 0 ]] && check_suspicious_imports "${IMPORTS[@]}"
        check_package_json
        ;;
esac

exit 0

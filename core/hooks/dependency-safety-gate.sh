#!/usr/bin/env bash
# PostToolUse: Write|Edit
# Scans for new imports/requires in modified files. Runs pip-audit or npm audit on new deps.
set -euo pipefail

TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-${CLAUDE_TOOL_INPUT_PATH:-}}"

[[ "$TOOL_NAME" =~ ^(Write|Edit)$ ]] || exit 0
[[ -n "$FILE_PATH" && -f "$FILE_PATH" ]] || exit 0

EXT="${FILE_PATH##*.}"

extract_python_imports() {
    grep -oP '^(?:import|from)\s+\K[\w]+' "$1" 2>/dev/null | sort -u
}

extract_js_imports() {
    grep -oP "(?:import|require)\s*[\({'\"][\s]*\K[^'\"\s\)]+(?=['\"\s\)])" "$1" 2>/dev/null \
        | grep -v '^\.' | sort -u
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

case "$EXT" in
    py)
        mapfile -t IMPORTS < <(extract_python_imports "$FILE_PATH")
        [[ ${#IMPORTS[@]} -gt 0 ]] && check_suspicious_imports "${IMPORTS[@]}"
        check_requirements_txt
        ;;
    ts|tsx|js|jsx)
        mapfile -t IMPORTS < <(extract_js_imports "$FILE_PATH")
        [[ ${#IMPORTS[@]} -gt 0 ]] && check_suspicious_imports "${IMPORTS[@]}"
        check_package_json
        ;;
esac

exit 0

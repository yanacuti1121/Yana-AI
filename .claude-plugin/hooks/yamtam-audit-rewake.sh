#!/usr/bin/env bash
# yamtam-audit-rewake.sh
# Runs yamtam audit and prints findings for asyncRewake.
# Only outputs if status=findings — silent exit on clean.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Locate audit_scanner.py
SCANNER=""
for candidate in \
    "${CLAUDE_PLUGIN_ROOT:-__none__}/../../core/scripts/audit_scanner.py" \
    "$REPO_ROOT/core/scripts/audit_scanner.py" \
    "$REPO_ROOT/.claude/scripts/audit_scanner.py"
do
    [[ -f "$candidate" ]] && { SCANNER="$candidate"; break; }
done

[[ -z "$SCANNER" ]] && exit 0  # not installed — silent

RESULT="$(python3 "$SCANNER" "$REPO_ROOT" --json 2>/dev/null)" || true
[[ -z "$RESULT" ]] && exit 0

python3 - "$RESULT" <<'PYEOF'
import sys, json

try:
    data = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)

if data.get("status") != "findings":
    sys.exit(0)

summary = data.get("summary", {})
total = summary.get("total_findings") or summary.get("total", 0)
score = data.get("score", 100)
risk  = data.get("risk_level", "")

print(f"## YAMTAM Audit — {total} finding(s) · Score {score}/100 · {risk}")
print()

by_severity = {}
for f in data.get("findings", []):
    sev = f.get("severity", "info").upper()
    if sev != "INFO":
        by_severity.setdefault(sev, []).append(f)

for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
    items = by_severity.get(sev, [])
    if not items:
        continue
    print(f"### {sev} ({len(items)})")
    for f in items:
        msg = f.get("message") or f.get("reason") or f["id"]
        print(f"- **{f['id']}** `{f['file']}` — {msg}")
        if f.get("fix"):
            print(f"  Fix: {f['fix']}")
    print()
PYEOF

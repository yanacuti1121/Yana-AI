#!/usr/bin/env bash
# Version: 1.6.0 | Status: active
# Description: Risk Scorer — PreToolUse hook that assigns a 0-100 risk score to
#   each AI action. Low risk (0-39): auto-allow. Medium (40-69): advisory warn.
#   High (70-100): inject into human-gate flow.
#
# Hook type: PreToolUse (advisory, never hard-blocks alone)
# Bypass:    YAMTAM_RISK_BYPASS=1
# State:     core/memory/L2_session/risk-log.jsonl (gitignored)

set -uo pipefail

[[ "${YAMTAM_RISK_BYPASS:-0}" == "1" ]] && exit 0
command -v python3 >/dev/null 2>&1 || exit 0

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
RISK_LOG="${YAMTAM_RISK_LOG:-$PROJECT_ROOT/core/memory/L2_session/risk-log.jsonl}"
RISK_THRESHOLD_WARN="${YAMTAM_RISK_WARN:-40}"
RISK_THRESHOLD_GATE="${YAMTAM_RISK_GATE:-70}"
LOG_FILE="${YAMTAM_LOG:-/tmp/yamtam-audit.log}"

TOOL_NAME="${CLAUDE_TOOL_NAME:-unknown}"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

INPUT=$(cat)

mkdir -p "$(dirname "$RISK_LOG")"

RESULT=$(python3 - "$TOOL_NAME" "$NOW" "$RISK_THRESHOLD_WARN" "$RISK_THRESHOLD_GATE" <<'PYEOF'
import json, sys, re, os

tool = sys.argv[1]
now = sys.argv[2]
warn_thresh = int(sys.argv[3])
gate_thresh = int(sys.argv[4])

try:
    data = json.loads(sys.stdin.read())
except Exception:
    print("SCORE:0:ok")
    sys.exit(0)

inp = data.get('tool_input', data)
score = 0
reasons = []

# ── Tool-level base risk ───────────────────────────────────────────────────────
tool_risk = {
    'Bash': 30, 'Write': 20, 'Edit': 15, 'MultiEdit': 20,
    'Read': 0, 'Glob': 0, 'Grep': 0, 'WebFetch': 10,
    'Task': 25, 'Agent': 35,
}
base = tool_risk.get(tool, 10)
score += base
if base > 0:
    reasons.append(f"tool={tool}(+{base})")

# ── Command content analysis (Bash tool) ──────────────────────────────────────
if tool == 'Bash':
    cmd = inp.get('command', '')

    patterns = [
        (50, r'rm\s+-rf?',          'destructive-rm'),
        (60, r'git\s+push\s+--force','force-push'),
        (55, r'drop\s+table',        'sql-drop'),
        (45, r'>\s*/dev/null.*&&',   'silent-fail'),
        (40, r'curl.*\|\s*(ba)?sh',  'pipe-to-shell'),
        (35, r'sudo\b',              'sudo'),
        (30, r'chmod\s+777',         'chmod-777'),
        (25, r'git\s+reset\s+--hard','git-reset-hard'),
        (40, r'kubectl\s+delete',    'k8s-delete'),
        (35, r'docker\s+rm',         'docker-rm'),
        (30, r'npm\s+publish',       'npm-publish'),
        (20, r'git\s+push\b',        'git-push'),
        (15, r'pip\s+install',       'pip-install'),
    ]
    for pts, pattern, label in patterns:
        if re.search(pattern, cmd, re.IGNORECASE):
            score += pts
            reasons.append(f"{label}(+{pts})")
            break  # one dominant pattern

# ── File path risk (Write/Edit) ────────────────────────────────────────────────
if tool in ('Write', 'Edit', 'MultiEdit'):
    path = str(inp.get('file_path', inp.get('path', '')))
    sensitive_patterns = [
        (40, r'\.(env|secret|key|pem|p12|pfx)($|\.)', 'sensitive-file'),
        (30, r'/(core/hooks|core/rules|core/gates)/',   'core-yamtam'),
        (25, r'settings\.json',                         'settings'),
        (20, r'package\.json',                          'package-json'),
        (15, r'\.(sh|bash)$',                           'shell-script'),
    ]
    for pts, pattern, label in sensitive_patterns:
        if re.search(pattern, path, re.IGNORECASE):
            score += pts
            reasons.append(f"{label}(+{pts})")
            break

# ── Cap at 100 ────────────────────────────────────────────────────────────────
score = min(score, 100)

level = 'low' if score < warn_thresh else ('medium' if score < gate_thresh else 'high')
reason_str = ', '.join(reasons) if reasons else 'baseline'
print(f"SCORE:{score}:{level}:{reason_str}")
PYEOF
)

SCORE=$(echo "$RESULT" | cut -d: -f2)
LEVEL=$(echo "$RESULT" | cut -d: -f3)
REASONS=$(echo "$RESULT" | cut -d: -f4-)

# Log to JSONL
echo "{\"ts\":\"$NOW\",\"tool\":\"$TOOL_NAME\",\"score\":$SCORE,\"level\":\"$LEVEL\",\"reasons\":\"$REASONS\"}" >> "$RISK_LOG" 2>/dev/null || true

# Output advisory for medium/high
if [[ "$SCORE" -ge "$RISK_THRESHOLD_WARN" ]]; then
  if [[ "$SCORE" -ge "$RISK_THRESHOLD_GATE" ]]; then
    echo "[YAMTAM/risk] ⚠ HIGH RISK score=${SCORE}/100 — ${REASONS}"
    echo "[YAMTAM/risk] Consider: checkpoint first (bash core/scripts/session-checkpoint.sh)"
    echo "[${NOW}] RISK-HIGH tool='$TOOL_NAME' score=$SCORE reasons='$REASONS'" >> "$LOG_FILE" 2>/dev/null || true
  else
    echo "[YAMTAM/risk] MEDIUM risk score=${SCORE}/100 — ${REASONS}"
  fi
fi

exit 0

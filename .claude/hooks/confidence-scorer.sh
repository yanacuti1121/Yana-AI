#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.6.0 | Status: active
# Description: Confidence Scorer — score action confidence 0–100 and annotate low-confidence actions
# Hook type: PreToolUse (advisory, non-blocking)
# Last Reviewed: 2026-05-23
# Bypass: YAMTAM_CONFIDENCE_BYPASS=1
# Requires: python3

set -uo pipefail

[[ "${YAMTAM_CONFIDENCE_BYPASS:-0}" == "1" ]] && exit 0
command -v python3 >/dev/null 2>&1 || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
CONF_LOG="$STATE_DIR/confidence-scores.jsonl"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$STATE_DIR"

TMP_INPUT=$(mktemp)
cat > "$TMP_INPUT"
trap 'rm -f "$TMP_INPUT"' EXIT

python3 - "$TMP_INPUT" "$CONF_LOG" "$TIMESTAMP" << 'PYEOF'
import json, sys, re
from pathlib import Path

input_file, conf_log, ts = sys.argv[1], sys.argv[2], sys.argv[3]

try:
    data = json.loads(Path(input_file).read_text())
    ti   = data.get('tool_input', {})
    tool = data.get('tool_name', '')
    cmd  = str(ti.get('command', ''))
    path = str(ti.get('file_path', ti.get('path', '')))
    content = str(ti.get('content', ''))[:200]
except Exception:
    sys.exit(0)

all_text = (tool + ' ' + cmd + ' ' + path + ' ' + content).lower()

# Confidence heuristics — what reduces confidence?
score = 100
notes = []

# Ambiguous target patterns
if re.search(r'\*\*|\*\s*\*|glob|\?\w*', all_text):
    score -= 20; notes.append('wildcard_target:-20')

# Very long commands (hard to verify)
if len(cmd) > 200:
    score -= 15; notes.append('long_cmd:-15')

# No file path for Write/Edit tool
if tool in ('Write', 'Edit') and not path:
    score -= 25; notes.append('no_path_for_edit:-25')

# Multiple operations chained (&&, |, ;)
chain_count = len(re.findall(r'&&|\|\||;', cmd))
if chain_count >= 3:
    score -= 10 * min(chain_count - 2, 3); notes.append(f'chained_ops:{chain_count}:-{10*min(chain_count-2,3)}')

# Known-safe operations bonus
if re.match(r'^\s*(git\s+(log|status|diff)|ls|find|cat|grep|head|tail)\b', cmd.lower()):
    score += 10; notes.append('known_safe:+10')

# Interactive flag (less predictable)
if re.search(r'(\s-i\b|\s--interactive\b)', cmd):
    score -= 15; notes.append('interactive:-15')

score = max(0, min(100, score))
band = 'HIGH' if score >= 80 else 'MEDIUM' if score >= 50 else 'LOW'

# Log entry
entry = {
    'ts': ts, 'tool': tool, 'confidence': score,
    'band': band, 'notes': ','.join(notes) or 'none',
    'cmd': cmd[:80], 'file': path[:100]
}
with open(conf_log, 'a') as f:
    f.write(json.dumps(entry) + '\n')

# Only emit advisory for low confidence
if band == 'LOW':
    print(f'[confidence-scorer] LOW confidence ({score}/100) for {tool}')
    if notes:
        print(f'  Factors: {", ".join(notes)}')
    print(f'  Verify scope before proceeding.')
elif band == 'MEDIUM':
    print(f'[confidence-scorer] MEDIUM confidence ({score}/100) — {tool}')

sys.exit(0)
PYEOF

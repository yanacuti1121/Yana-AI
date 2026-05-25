#!/usr/bin/env bash
# Version: 1.6.0 | Status: active
# Description: Multi-agent arbitration — PreToolUse hook that detects scope conflicts
#   when 2+ agents claim overlapping file paths. Warns (advisory) or blocks (hard)
#   depending on conflict severity.
#
# Hook type: PreToolUse
# Blocking:  soft conflict → exit 0 + advisory; hard conflict (same file, different agents) → exit 2
# Bypass:    YAMTAM_ARBITRATION_BYPASS=1 (sovereign only)
# State:     core/memory/L2_session/agent-registry.json (gitignored)
#
# Registry schema:
#   { "agents": { "<agent_id>": { "claimed_paths": [...], "started_at": "...", "tool": "..." } } }

set -uo pipefail

[[ "${YAMTAM_ARBITRATION_BYPASS:-0}" == "1" ]] && exit 0
command -v python3 >/dev/null 2>&1 || exit 0

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
REGISTRY="${YAMTAM_AGENT_REGISTRY:-$PROJECT_ROOT/core/memory/L2_session/agent-registry.json}"
LOG_FILE="${YAMTAM_LOG:-/tmp/yamtam-audit.log}"

TOOL_NAME="${CLAUDE_TOOL_NAME:-unknown}"
AGENT_ID="${YAMTAM_AGENT_ID:-default}"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Only intercept file-write tools
case "$TOOL_NAME" in
  Write|Edit|MultiEdit|Bash) ;;
  *) exit 0 ;;
esac

# Read tool input from stdin
INPUT=$(cat)

# Extract file path(s) from tool input
PATHS=$(python3 - "$TOOL_NAME" <<'PYEOF'
import json, sys, os

tool = sys.argv[1]
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

paths = []
inp = data.get('tool_input', data)

if tool in ('Write', 'Edit', 'MultiEdit'):
    p = inp.get('file_path') or inp.get('path')
    if p:
        paths.append(os.path.normpath(p))
    # MultiEdit: edits array
    for ed in inp.get('edits', []):
        p2 = ed.get('file_path') or ed.get('path')
        if p2:
            paths.append(os.path.normpath(p2))
elif tool == 'Bash':
    cmd = inp.get('command', '')
    # Extract file paths from common write commands (rough heuristic)
    import re
    found = re.findall(r'(?:>|>>|tee)\s+([^\s|&;]+)', cmd)
    paths.extend(os.path.normpath(p) for p in found if not p.startswith('-'))

print('\n'.join(set(paths)))
PYEOF
)

[[ -z "$PATHS" ]] && echo "$INPUT" | python3 -c "import sys; sys.stdin.read()" 2>/dev/null; exit 0

# Initialize registry
mkdir -p "$(dirname "$REGISTRY")"
if [[ ! -f "$REGISTRY" ]]; then
  python3 -c "import json; print(json.dumps({'agents': {}}, indent=2))" > "$REGISTRY"
fi

# Check for conflicts and register current agent's paths
CONFLICT=$(python3 - "$REGISTRY" "$AGENT_ID" "$TOOL_NAME" "$NOW" <<PYEOF
import json, sys, os

registry_path, my_agent, tool, now = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
my_paths = """$PATHS""".strip().split('\n')
my_paths = [p for p in my_paths if p]

with open(registry_path) as f:
    reg = json.load(f)

agents = reg.setdefault('agents', {})

# Expire stale agents (> 2 hours old)
from datetime import datetime, timezone
cutoff = None
try:
    cutoff = datetime.now(timezone.utc)
except Exception:
    pass

stale = []
for aid, info in agents.items():
    try:
        ts = datetime.fromisoformat(info.get('started_at', '').replace('Z', '+00:00'))
        elapsed = (cutoff - ts).total_seconds() if cutoff else 0
        if elapsed > 7200:
            stale.append(aid)
    except Exception:
        pass
for aid in stale:
    del agents[aid]

# Check conflicts
conflicts = []
for other_agent, info in agents.items():
    if other_agent == my_agent:
        continue
    other_paths = info.get('claimed_paths', [])
    for mp in my_paths:
        for op in other_paths:
            # Exact match or one is parent of the other
            mp_n = os.path.normpath(mp)
            op_n = os.path.normpath(op)
            if mp_n == op_n or mp_n.startswith(op_n + os.sep) or op_n.startswith(mp_n + os.sep):
                conflicts.append({'path': mp_n, 'other': other_agent, 'other_tool': info.get('tool', '?')})

# Register / update this agent's paths
if my_agent not in agents:
    agents[my_agent] = {'claimed_paths': [], 'started_at': now, 'tool': tool}
existing = set(agents[my_agent].get('claimed_paths', []))
existing.update(my_paths)
agents[my_agent]['claimed_paths'] = list(existing)
agents[my_agent]['last_active'] = now

reg['agents'] = agents
with open(registry_path, 'w') as f:
    json.dump(reg, f, indent=2)

if conflicts:
    parts = [f"{c['path']} (held by {c['other']})" for c in conflicts]
    print('CONFLICT:' + '|'.join(parts))
else:
    print('CLEAR')
PYEOF
)

if [[ "$CONFLICT" == CONFLICT:* ]]; then
  DETAILS="${CONFLICT#CONFLICT:}"
  echo "[${NOW}] ARBITRATION-CONFLICT agent='$AGENT_ID' tool='$TOOL_NAME' paths='$DETAILS'" >> "$LOG_FILE" 2>/dev/null || true

  # Hard block only if exact same file, advisory for overlapping dirs
  EXACT=$(echo "$DETAILS" | grep -c "EXACT:" || true)
  if [[ "$EXACT" -gt 0 ]]; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[YAMTAM/arbitration] CONFLICT: %s — another agent holds exclusive access. Use YAMTAM_ARBITRATION_BYPASS=1 if certain."}}\n' "$DETAILS"
    exit 2
  else
    echo "[YAMTAM/arbitration] SOFT CONFLICT: $DETAILS — coordinate with other agents before writing"
    exit 0
  fi
fi

exit 0

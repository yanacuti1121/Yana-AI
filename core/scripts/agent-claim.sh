#!/usr/bin/env bash
# Claim file paths for the current agent in the arbitration registry.
# Usage: bash agent-claim.sh <path1> [path2] ...
#        YAMTAM_AGENT_ID=my-agent bash agent-claim.sh src/components/
#
# Options:
#   --release   Release all claims for this agent instead of adding
#   --list      Show current registry state

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
REGISTRY="${YAMTAM_AGENT_REGISTRY:-$PROJECT_ROOT/core/memory/L2_session/agent-registry.json}"
AGENT_ID="${YAMTAM_AGENT_ID:-default}"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$(dirname "$REGISTRY")"
if [[ ! -f "$REGISTRY" ]]; then
  python3 -c "import json; print(json.dumps({'agents': {}}, indent=2))" > "$REGISTRY"
fi

MODE="claim"
PATHS=()
for arg in "$@"; do
  case "$arg" in
    --release) MODE="release" ;;
    --list)    MODE="list" ;;
    *)         PATHS+=("$arg") ;;
  esac
done

python3 - "$REGISTRY" "$AGENT_ID" "$MODE" "$NOW" "${PATHS[@]+"${PATHS[@]}"}" <<'PYEOF'
import json, sys, os

registry_path = sys.argv[1]
agent_id = sys.argv[2]
mode = sys.argv[3]
now = sys.argv[4]
paths = [os.path.normpath(p) for p in sys.argv[5:]]

with open(registry_path) as f:
    reg = json.load(f)

agents = reg.setdefault('agents', {})

if mode == 'list':
    if not agents:
        print("No active agents registered.")
    else:
        for aid, info in agents.items():
            claimed = info.get('claimed_paths', [])
            print(f"  {aid} (active since {info.get('started_at', '?')})")
            for p in claimed:
                print(f"    → {p}")
    sys.exit(0)

if mode == 'release':
    if agent_id in agents:
        del agents[agent_id]
        print(f"Released all claims for agent '{agent_id}'")
    else:
        print(f"No claims found for agent '{agent_id}'")
else:
    # claim
    if agent_id not in agents:
        agents[agent_id] = {'claimed_paths': [], 'started_at': now, 'tool': 'manual'}
    existing = set(agents[agent_id].get('claimed_paths', []))
    existing.update(paths)
    agents[agent_id]['claimed_paths'] = sorted(existing)
    agents[agent_id]['last_active'] = now
    print(f"Claimed {len(paths)} path(s) for agent '{agent_id}':")
    for p in paths:
        print(f"  + {p}")

reg['agents'] = agents
with open(registry_path, 'w') as f:
    json.dump(reg, f, indent=2)
PYEOF

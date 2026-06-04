#!/usr/bin/env bash
# task-state.sh — CRUD cho task registry trong multi-agent session
# Usage:
#   task-state.sh create  <task_id> <agent_id> <description> <scope_csv>
#   task-state.sh update  <task_id> running|done|failed [result_summary]
#   task-state.sh get     <task_id>
#   task-state.sh list    [running|done|failed|all]
#   task-state.sh summary
#   task-state.sh clear

set -euo pipefail

REGISTRY="${CLAUDE_PROJECT_DIR:-.}/.claude/state/task-registry.json"
CMD="${1:-list}"
mkdir -p "$(dirname "$REGISTRY")"

# ── Init registry nếu chưa tồn tại ───────────────────────────────────────────
init_registry() {
  if [[ ! -f "$REGISTRY" ]]; then
    python3 -c "
import json
data = {'session_start': '$(date -u +%Y-%m-%dT%H:%M:%SZ)', 'tasks': {}}
json.dump(data, open('$REGISTRY','w'), indent=2)
"
  fi
}

# ── CREATE ────────────────────────────────────────────────────────────────────
cmd_create() {
  local task_id="$1"
  local agent_id="${2:-main}"
  local description="${3:-unnamed task}"
  local scope_csv="${4:-}"
  local now
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  init_registry
  python3 -c "
import json, sys
task_id = '$task_id'
scope = [s.strip() for s in '$scope_csv'.split(',') if s.strip()]
registry = json.load(open('$REGISTRY'))
if task_id in registry['tasks']:
    print('[task-state] WARNING: ' + task_id + ' already exists — overwriting')
registry['tasks'][task_id] = {
    'id': task_id,
    'agent': '$agent_id',
    'description': '$description',
    'scope': scope,
    'status': 'pending',
    'created': '$now',
    'updated': '$now',
    'result': None
}
json.dump(registry, open('$REGISTRY','w'), indent=2)
print('[task-state] created ' + task_id)
"
}

# ── UPDATE ────────────────────────────────────────────────────────────────────
cmd_update() {
  local task_id="$1"
  local status="${2:-running}"
  local result="${3:-}"
  local now
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  init_registry
  python3 -c "
import json, sys
task_id = '$task_id'
registry = json.load(open('$REGISTRY'))
if task_id not in registry['tasks']:
    print('[task-state] ERROR: ' + task_id + ' not found')
    sys.exit(1)
registry['tasks'][task_id]['status'] = '$status'
registry['tasks'][task_id]['updated'] = '$now'
result = '$result'
if result:
    registry['tasks'][task_id]['result'] = result
json.dump(registry, open('$REGISTRY','w'), indent=2)
print('[task-state] ' + task_id + ' → $status')
"
}

# ── GET ───────────────────────────────────────────────────────────────────────
cmd_get() {
  local task_id="$1"
  init_registry
  python3 -c "
import json, sys
registry = json.load(open('$REGISTRY'))
task = registry['tasks'].get('$task_id')
if not task:
    print('[task-state] not found: $task_id')
    sys.exit(1)
print(json.dumps(task, indent=2))
"
}

# ── LIST ──────────────────────────────────────────────────────────────────────
cmd_list() {
  local filter="${1:-all}"
  init_registry
  python3 -c "
import json
filter_status = '$filter'
registry = json.load(open('$REGISTRY'))
tasks = registry['tasks']
if not tasks:
    print('[task-state] No tasks registered')
    exit(0)
print('Task Registry — session: ' + registry.get('session_start','?'))
print('─' * 60)
icons = {'pending':'⏳','running':'🔄','done':'✅','failed':'❌'}
for tid, t in tasks.items():
    if filter_status != 'all' and t['status'] != filter_status:
        continue
    icon = icons.get(t['status'],'?')
    scope = ', '.join(t.get('scope',[])[:2]) or '—'
    result_preview = (t.get('result') or '')[:50]
    print(icon + ' [' + tid + '] ' + t['description'][:45])
    print('   agent=' + t['agent'] + ' scope=' + scope)
    if result_preview:
        print('   result: ' + result_preview)
print('─' * 60)
done = sum(1 for t in tasks.values() if t['status']=='done')
running = sum(1 for t in tasks.values() if t['status']=='running')
failed = sum(1 for t in tasks.values() if t['status']=='failed')
print('Total: ' + str(len(tasks)) + ' | done=' + str(done) + ' running=' + str(running) + ' failed=' + str(failed))
"
}

# ── SUMMARY ───────────────────────────────────────────────────────────────────
cmd_summary() {
  init_registry
  python3 -c "
import json
registry = json.load(open('$REGISTRY'))
tasks = list(registry['tasks'].values())
done = [t for t in tasks if t['status']=='done']
failed = [t for t in tasks if t['status']=='failed']
running = [t for t in tasks if t['status']=='running']
print('Multi-Agent Session Summary')
print('  Total:   ' + str(len(tasks)))
print('  Done:    ' + str(len(done)))
print('  Running: ' + str(len(running)))
print('  Failed:  ' + str(len(failed)))
if failed:
    print('  Failed tasks:')
    for t in failed:
        print('    - ' + t['id'] + ': ' + t['description'][:50])
"
}

# ── CLEAR ─────────────────────────────────────────────────────────────────────
cmd_clear() {
  if [[ -f "$REGISTRY" ]]; then
    rm -f "$REGISTRY"
    echo "[task-state] registry cleared"
  else
    echo "[task-state] nothing to clear"
  fi
}

case "$CMD" in
  create)  cmd_create  "${2:-}" "${3:-main}" "${4:-task}" "${5:-}" ;;
  update)  cmd_update  "${2:-}" "${3:-running}" "${4:-}" ;;
  get)     cmd_get     "${2:-}" ;;
  list)    cmd_list    "${2:-all}" ;;
  summary) cmd_summary ;;
  clear)   cmd_clear ;;
  *)
    echo "Usage: task-state.sh <create|update|get|list|summary|clear> [args]"
    exit 1
    ;;
esac

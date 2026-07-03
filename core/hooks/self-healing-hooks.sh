#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Self-Healing Hooks — detect unauthorized bypass usage and restore hook integrity
# Hook type: PostToolUse (audit + remediation)
# Last Reviewed: 2026-05-23
# Requires: python3

set -uo pipefail

command -v python3 >/dev/null 2>&1 || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
HOOKS_DIR="$PROJECT_DIR/core/hooks"
HEAL_LOG="$STATE_DIR/self-heal.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$STATE_DIR"

TMP_INPUT=$(mktemp)
cat > "$TMP_INPUT"
trap 'rm -f "$TMP_INPUT"' EXIT

python3 - "$TMP_INPUT" "$HOOKS_DIR" "$HEAL_LOG" "$TIMESTAMP" "$STATE_DIR" << 'PYEOF'
import json, sys, os, re, hashlib
from pathlib import Path

input_file, hooks_dir, heal_log, ts, state_dir = sys.argv[1:]

try:
    data = json.loads(Path(input_file).read_text())
    ti   = data.get('tool_input', {})
    tool = data.get('tool_name', '')
    cmd  = str(ti.get('command', ''))
    content = str(ti.get('content', ''))
except Exception:
    sys.exit(0)

issues = []

# 1. Detect bypass env vars being set (potential unauthorized bypass)
bypass_set = re.findall(r'YANA_\w+_BYPASS\s*=\s*["\']?1["\']?', cmd + content)
if bypass_set:
    sovereign = os.environ.get('YANA_SOVEREIGN_NAME', '')
    if not sovereign:
        issues.append({
            'type': 'unauthorized-bypass',
            'detail': f'Bypass set without sovereign identity: {bypass_set}',
            'severity': 'HIGH'
        })
    else:
        issues.append({
            'type': 'bypass-logged',
            'detail': f'Bypass set by sovereign {sovereign}: {bypass_set}',
            'severity': 'INFO'
        })

# 2. Check hook file integrity (executable + non-empty)
hooks_path = Path(hooks_dir)
if hooks_path.exists():
    for hook_file in hooks_path.glob('*.sh'):
        stat = hook_file.stat()
        if stat.st_size == 0:
            issues.append({
                'type': 'empty-hook',
                'detail': f'{hook_file.name} is empty',
                'severity': 'CRITICAL'
            })
        elif not os.access(str(hook_file), os.X_OK):
            issues.append({
                'type': 'non-executable-hook',
                'detail': f'{hook_file.name} is not executable',
                'severity': 'HIGH'
            })

# 3. Check if YANA_BYPASS is set globally without sovereign
global_bypass = os.environ.get('YANA_BYPASS', '')
if global_bypass == '1' and not os.environ.get('YANA_SOVEREIGN_NAME', ''):
    issues.append({
        'type': 'global-bypass-no-sovereign',
        'detail': 'YANA_BYPASS=1 set without sovereign identity',
        'severity': 'CRITICAL'
    })

# Log all issues
with open(heal_log, 'a') as f:
    for issue in issues:
        entry = {'ts': ts, **issue}
        f.write(json.dumps(entry) + '\n')

# Emit warnings for non-INFO issues
for issue in issues:
    if issue['severity'] != 'INFO':
        print(f'[self-healing-hooks] {issue["severity"]}: {issue["type"]}')
        print(f'  {issue["detail"]}')
        if issue['type'] == 'non-executable-hook':
            # Auto-fix: chmod +x
            hook_name = issue['detail'].split()[0]
            hook_path = hooks_path / hook_name
            if hook_path.exists():
                hook_path.chmod(hook_path.stat().st_mode | 0o111)
                print(f'  ✓ Auto-fixed: chmod +x {hook_name}')

sys.exit(0)
PYEOF

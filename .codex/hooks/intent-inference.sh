#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Intent Inference — detect true intent from tool sequence patterns and flag scope creep
# Hook type: PreToolUse (advisory)
# Last Reviewed: 2026-05-23
# Bypass: YANA_INTENT_BYPASS=1
# Requires: python3

set -uo pipefail

[[ "${YANA_INTENT_BYPASS:-0}" == "1" ]] && exit 0
command -v python3 >/dev/null 2>&1 || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
INTENT_LOG="$STATE_DIR/intent-log.jsonl"
SEQUENCE_FILE="$STATE_DIR/tool-sequence.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$STATE_DIR"

TMP_INPUT=$(mktemp)
cat > "$TMP_INPUT"
trap 'rm -f "$TMP_INPUT"' EXIT

python3 - "$TMP_INPUT" "$INTENT_LOG" "$SEQUENCE_FILE" "$TIMESTAMP" << 'PYEOF'
import json, os, sys, re
from pathlib import Path

sys.path.insert(0, os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd()))
from core.lib.py.file_lock import FileLock, LockTimeoutError

input_file, intent_log, seq_file, ts = sys.argv[1:]

try:
    data = json.loads(Path(input_file).read_text())
    ti   = data.get('tool_input', {})
    tool = data.get('tool_name', '')
    cmd  = str(ti.get('command', ''))
    path = str(ti.get('file_path', ti.get('path', '')))
except Exception:
    sys.exit(0)

# Load tool sequence (last N tool calls).
#
# ADR-008: the whole read -> append -> truncate -> write unit is inside one
# FileLock, not just write_text() — this hook fires on every PreToolUse
# call, so without the lock, two calls landing close together (a common
# case: several hooks matching the same event run in parallel) can each
# read the same pre-update sequence and the second writer silently drops
# the first's entry.
seq = []
seq_path = Path(seq_file)
current_entry = {'tool': tool, 'cmd': cmd[:60], 'path': path[:60], 'ts': ts}
try:
    with FileLock(str(seq_path), timeout=5.0):
        if seq_path.exists():
            try:
                seq = json.loads(seq_path.read_text()).get('sequence', [])
            except Exception:
                seq = []
        seq.append(current_entry)
        if len(seq) > 20:
            seq = seq[-20:]
        # Atomic write (temp + os.replace) — write_text() truncates before
        # writing; this file has no other known unlocked reader today, but
        # this hook fires on every PreToolUse call, so a future reader
        # (or a lock-bypass under YANA_INTENT_BYPASS) could still observe
        # a torn write without this.
        _tmp_path = seq_path.with_name(seq_path.name + f'.tmp.{os.getpid()}')
        _tmp_path.write_text(json.dumps({'sequence': seq}, indent=2))
        _tmp_path.replace(seq_path)
except LockTimeoutError:
    # Advisory hook — never let a lock timeout block the pattern-detection
    # below. Degrade to in-memory-only for this one call: whatever was on
    # disk before contention is lost for this call's flags, but nothing
    # crashes and nothing corrupts the persisted file. core/hooks/CLAUDE.md:
    # "Hooks must fail loudly or warn loudly" — logged to intent_log's own
    # JSONL stream (same file/format this hook already writes below), not
    # silently swallowed.
    seq = [current_entry]
    try:
        with open(intent_log, 'a') as f:
            f.write(json.dumps({'ts': ts, 'tool': tool, 'warning': 'lock_timeout_on_sequence_file'}) + '\n')
    except Exception:
        pass  # logging itself is best-effort — must never crash the hook

# Detect intent patterns from last N calls
recent_tools = [e['tool'] for e in seq[-5:]]
recent_cmds  = ' '.join(e['cmd'] for e in seq[-5:]).lower()
recent_paths = ' '.join(e['path'] for e in seq[-5:]).lower()

flags = []

# Pattern: read then write to prod (possible scope creep)
if 'Bash' in recent_tools and tool in ('Write', 'Edit'):
    if re.search(r'\b(prod|production|main|master)\b', recent_cmds + recent_paths):
        flags.append('scope-creep: read→write on production target')

# Pattern: many different file paths = broad change (not surgical)
unique_paths = len(set(e['path'] for e in seq[-8:] if e['path']))
if unique_paths > 5 and tool in ('Write', 'Edit'):
    flags.append(f'broad-change: {unique_paths} different files touched in last 8 calls')

# Pattern: rapid repeated Bash with escalating destructive verbs
destr_count = sum(1 for e in seq[-5:] if re.search(r'\b(rm|delete|drop|kill|force)\b', e['cmd'].lower()))
if destr_count >= 3:
    flags.append(f'escalation-pattern: {destr_count} destructive commands in last 5 calls')

# Pattern: credential/secret access followed by network call
secret_in_seq = any(re.search(r'(\.env|secret|credential|key|token|password)', e['path']+e['cmd']) for e in seq[-4:])
network_now   = tool == 'WebFetch' or re.search(r'\b(curl|wget|fetch)\b', cmd.lower())
if secret_in_seq and network_now:
    flags.append('⚠️  EXFIL-PATTERN: secret access followed by network call')

if not flags:
    # Log silently
    with open(intent_log, 'a') as f:
        f.write(json.dumps({'ts': ts, 'tool': tool, 'flags': [], 'seq_len': len(seq)}) + '\n')
    sys.exit(0)

# Emit advisory
for flag in flags:
    print(f'[intent-inference] {flag}')
print(f'  Context: last {len(seq[-5:])} calls → {", ".join(recent_tools)}')
print(f'  Current: {tool} {cmd[:50]}')

with open(intent_log, 'a') as f:
    f.write(json.dumps({'ts': ts, 'tool': tool, 'flags': flags, 'seq_len': len(seq)}) + '\n')

sys.exit(0)
PYEOF

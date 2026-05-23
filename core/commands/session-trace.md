---
name: session-trace
description: Show real-time ASCII timeline of all hook fires, blocks, and checkpoints this session
version: 1.6.0
---

# /session-trace

Renders an ASCII timeline of session events from risk scores, audit log, and checkpoints.

```python
#!/usr/bin/env python3
import os, json, re
from pathlib import Path
from datetime import datetime

project = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())
state   = Path(project) / '.claude' / 'state'

events = []

def parse_ts(ts):
    try:
        return datetime.fromisoformat(ts.replace('Z', '+00:00'))
    except Exception:
        return None

# Risk scores
risk_log = state / 'risk-scores.jsonl'
if risk_log.exists():
    for line in risk_log.read_text().splitlines():
        try:
            e = json.loads(line)
            dt = parse_ts(e.get('ts', ''))
            if dt:
                band = e.get('band', '?')
                icon = {'LOW': '·', 'MEDIUM': '▲', 'HIGH': '⚠', 'CRITICAL': '✖'}.get(band, '?')
                events.append((dt, icon, f"{e.get('tool','?')} score={e.get('score',0)} [{band}]"))
        except Exception:
            pass

# Audit chain
audit_log = state / 'audit-chain.log'
if audit_log.exists():
    for line in audit_log.read_text().splitlines():
        try:
            e = json.loads(line)
            dt = parse_ts(e.get('ts', ''))
            if dt:
                hook = e.get('hook', e.get('tool', '?'))
                action = e.get('action', e.get('decision', ''))
                events.append((dt, '◆', f"{hook} → {action}"))
        except Exception:
            pass

# Checkpoints
cp_index = state / 'checkpoints' / 'index.json'
if cp_index.exists():
    try:
        idx = json.loads(cp_index.read_text())
        for cp in idx.get('checkpoints', []):
            dt = parse_ts(cp.get('created_at', ''))
            if dt:
                events.append((dt, '📍', f"checkpoint: {cp['id']} [{cp.get('label','auto')}]"))
    except Exception:
        pass

events.sort(key=lambda x: x[0])

print()
print('  ╔══════════════════════════════════════════════╗')
print('  ║        YAMTAM REAL-TIME SESSION TRACE        ║')
print('  ╚══════════════════════════════════════════════╝')
print()

if not events:
    print('  No session events recorded yet.')
    print('  Events appear after hook fires, checkpoints, or audit entries.')
    print()
else:
    print(f'  {len(events)} event(s) recorded\n')
    print('  TIME (UTC)           ICON  EVENT')
    print('  ─────────────────────────────────────────────────────')

    prev_dt = None
    for dt, icon, desc in events:
        ts_str = dt.strftime('%Y-%m-%d %H:%M:%S')
        if prev_dt:
            gap = int((dt - prev_dt).total_seconds())
            if gap > 60:
                print(f'  {"·" * 20} +{gap}s gap {"·" * 10}')
        prev_dt = dt
        short = desc[:55] + ('…' if len(desc) > 55 else '')
        print(f'  {ts_str}  {icon}  {short}')

    print()

    # Legend
    print('  Legend:  · LOW  ▲ MEDIUM  ⚠ HIGH  ✖ CRITICAL  ◆ AUDIT  📍 CHECKPOINT')
print()
```

---
name: session-stats
description: Show hook fires, blocks, risk score history, and trust score for this session
version: 1.6.0
---

# /session-stats

Summary of all YAMTAM hook activity in this session.

```python
#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
from collections import Counter

project = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())
state   = Path(project) / '.claude' / 'state'

# Risk scores
risk_log = state / 'risk-scores.jsonl'
scores = []
band_counts = Counter()
tool_counts = Counter()
blocks = 0

if risk_log.exists():
    for line in risk_log.read_text().splitlines():
        try:
            e = json.loads(line)
            scores.append(e.get('score', 0))
            band_counts[e.get('band', '?')] += 1
            tool_counts[e.get('tool', '?')] += 1
            if e.get('band') == 'CRITICAL':
                blocks += 1
        except Exception:
            pass

# Audit chain
audit_log = state / 'audit-chain.log'
audit_entries = 0
rollbacks = 0
if audit_log.exists():
    for line in audit_log.read_text().splitlines():
        try:
            e = json.loads(line)
            audit_entries += 1
            if e.get('hook') == 'session-rollback':
                rollbacks += 1
        except Exception:
            pass

# Checkpoints
cp_index = state / 'checkpoints' / 'index.json'
cp_count = 0
cp_latest = 'none'
if cp_index.exists():
    idx = json.loads(cp_index.read_text())
    cp_count  = idx.get('count', 0)
    cp_latest = idx.get('latest', 'none')

# Trust score: 100 − (blocks*10) − (HIGH_count*3) − (MEDIUM_count*1), floor 0
trust = max(0, 100
    - blocks * 10
    - band_counts.get('HIGH', 0) * 3
    - band_counts.get('MEDIUM', 0) * 1
)

total = len(scores)
avg   = int(sum(scores) / total) if total else 0

print()
print('  ╔══════════════════════════════════════════════╗')
print('  ║          YAMTAM SESSION STATS                ║')
print('  ╚══════════════════════════════════════════════╝')
print()
print(f'  Risk actions scored : {total}')
print(f'  Average risk score  : {avg}/100')
print(f'  Breakdown           : CRITICAL={band_counts["CRITICAL"]}  HIGH={band_counts["HIGH"]}  MEDIUM={band_counts["MEDIUM"]}  LOW={band_counts["LOW"]}')
print(f'  Hard blocks (CRIT)  : {blocks}')
print()
print(f'  Checkpoints saved   : {cp_count}')
print(f'  Latest checkpoint   : {cp_latest}')
print(f'  Rollbacks executed  : {rollbacks}')
print(f'  Audit entries       : {audit_entries}')
print()

# Top risky tools
if tool_counts:
    print('  Top tools by risk fires:')
    for tool, cnt in tool_counts.most_common(5):
        print(f'    {tool:<28} {cnt}x')
    print()

bar_trust = '█' * (trust // 10) + '░' * (10 - trust // 10)
print(f'  Trust score  [{bar_trust}] {trust}/100')
print()
if trust >= 80:
    print('  Status: ✅ Session healthy')
elif trust >= 50:
    print('  Status: ⚠️  Review flagged actions')
else:
    print('  Status: 🔴 High-risk session — consider rollback')
print()
```

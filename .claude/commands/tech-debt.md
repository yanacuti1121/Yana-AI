---
name: tech-debt
description: Scan codebase for TODO, FIXME, HACK, XXX markers and output a prioritized debt report
version: 1.6.0
---

# /tech-debt

Scans all source files for technical debt markers and groups them by severity.

```python
#!/usr/bin/env python3
import os, re, sys
from pathlib import Path
from collections import defaultdict

project = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())
root    = Path(project)

MARKERS = {
    'FIXME': '🔴 CRITICAL',
    'HACK':  '🟠 HIGH',
    'XXX':   '🟠 HIGH',
    'TODO':  '🟡 MEDIUM',
    'NOTE':  '⚪ LOW',
}

SKIP_DIRS = {'.git', 'node_modules', '__pycache__', '.venv', 'venv',
             'dist', 'build', '.claude', 'archived'}
SKIP_EXT  = {'.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff',
             '.ttf', '.eot', '.min.js', '.min.css', '.lock'}

results = defaultdict(list)
scanned = 0

pattern = re.compile(r'(FIXME|HACK|XXX|TODO|NOTE)[:\s]*(.*)', re.IGNORECASE)

for path in root.rglob('*'):
    if path.is_dir():
        continue
    if any(skip in path.parts for skip in SKIP_DIRS):
        continue
    if path.suffix.lower() in SKIP_EXT:
        continue
    try:
        text  = path.read_text(encoding='utf-8', errors='ignore')
        lines = text.splitlines()
        scanned += 1
        for i, line in enumerate(lines, 1):
            m = pattern.search(line)
            if m:
                marker = m.group(1).upper()
                note   = m.group(2).strip()[:80]
                rel    = path.relative_to(root)
                results[marker].append((str(rel), i, note))
    except Exception:
        pass

ORDER = ['FIXME', 'HACK', 'XXX', 'TODO', 'NOTE']
total = sum(len(v) for v in results.values())

print()
print('  ╔══════════════════════════════════════════════╗')
print('  ║           YAMTAM TECH DEBT REPORT            ║')
print('  ╚══════════════════════════════════════════════╝')
print()
print(f'  Files scanned : {scanned}')
print(f'  Debt items    : {total}')
print()

if not results:
    print('  ✅ No tech debt markers found')
    sys.exit(0)

for marker in ORDER:
    items = results.get(marker, [])
    if not items:
        continue
    label = MARKERS[marker]
    print(f'  {label} — {marker} ({len(items)} items)')
    print(f'  {"─" * 48}')
    for filepath, lineno, note in sorted(items):
        short = note if len(note) < 60 else note[:57] + '...'
        print(f'    {filepath}:{lineno}')
        if short:
            print(f'      → {short}')
    print()

# Summary bar
print('  Breakdown:')
for marker in ORDER:
    cnt = len(results.get(marker, []))
    if cnt:
        bar = '█' * min(cnt, 40)
        print(f'    {marker:<6} {bar} {cnt}')
print()
```

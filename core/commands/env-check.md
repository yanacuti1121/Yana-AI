---
name: env-check
description: Compare .env vs .env.example to find missing keys, extra keys, and empty values
version: 1.6.0
---

# /env-check

Audits environment variable configuration against the example template.

```python
#!/usr/bin/env python3
import os, sys, re
from pathlib import Path

project = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())
root    = Path(project)

env_file     = root / '.env'
example_file = root / '.env.example'

def parse_env(path):
    keys = {}
    if not path.exists():
        return keys
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        m = re.match(r'^([A-Z_][A-Z0-9_]*)=(.*)', line)
        if m:
            keys[m.group(1)] = m.group(2).strip()
    return keys

env     = parse_env(env_file)
example = parse_env(example_file)

missing  = [k for k in example if k not in env]
extra    = [k for k in env     if k not in example]
empty    = [k for k in env     if env[k] == '' or env[k] == '""' or env[k] == "''"]
ok       = [k for k in example if k in env and env[k]]

print()
print('  ╔══════════════════════════════════════════════╗')
print('  ║            YAMTAM ENV CHECK                  ║')
print('  ╚══════════════════════════════════════════════╝')
print()

if not env_file.exists():
    print('  ⚠️  .env not found — copy .env.example and fill values')
    sys.exit(1)
if not example_file.exists():
    print('  ⚠️  .env.example not found — nothing to compare against')
    sys.exit(1)

print(f'  .env          : {len(env)} keys')
print(f'  .env.example  : {len(example)} keys')
print()

if ok:
    print(f'  ✅ Present & set ({len(ok)}):')
    for k in sorted(ok):
        print(f'     {k}')
    print()

if missing:
    print(f'  ❌ Missing from .env ({len(missing)}):')
    for k in sorted(missing):
        print(f'     {k}  (example: {example[k] or "<empty>"})')
    print()

if empty:
    print(f'  ⚠️  Empty values ({len(empty)}):')
    for k in sorted(empty):
        print(f'     {k}')
    print()

if extra:
    print(f'  ℹ️  Extra keys not in .env.example ({len(extra)}):')
    for k in sorted(extra):
        print(f'     {k}')
    print()

if not missing and not empty:
    print('  ✅ All required env vars are set')
else:
    print(f'  Fix {len(missing)} missing + {len(empty)} empty keys before running in production')
print()
```

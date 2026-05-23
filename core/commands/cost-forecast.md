---
name: cost-forecast
description: Estimate token cost before starting a task based on scope, file count, and complexity
version: 1.6.0
---

# /cost-forecast [task description]

Estimates token cost and USD before executing a task.

```python
#!/usr/bin/env python3
import os, sys, json, re
from pathlib import Path

project = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())
root    = Path(project)
state   = root / '.claude' / 'state'

# Read task description from args or prompt
task_desc = ' '.join(sys.argv[1:]) if len(sys.argv) > 1 else ''

# Sonnet 4.5/4.6 pricing (per 1M tokens)
INPUT_COST_PER_MTK  = 3.00
OUTPUT_COST_PER_MTK = 15.00

# Heuristic multipliers
COMPLEXITY = {
    'refactor':    {'in': 40000, 'out': 8000,  'label': 'Refactor'},
    'new feature': {'in': 20000, 'out': 5000,  'label': 'New Feature'},
    'bug fix':     {'in': 15000, 'out': 3000,  'label': 'Bug Fix'},
    'test':        {'in': 10000, 'out': 4000,  'label': 'Add Tests'},
    'docs':        {'in': 5000,  'out': 2000,  'label': 'Docs/Comments'},
    'migrate':     {'in': 50000, 'out': 10000, 'label': 'Migration'},
    'review':      {'in': 30000, 'out': 6000,  'label': 'Code Review'},
    'debug':       {'in': 12000, 'out': 3000,  'label': 'Debug'},
}
DEFAULT = {'in': 15000, 'out': 4000, 'label': 'General Task'}

# Match task type
task_l = task_desc.lower()
matched = DEFAULT
for key, vals in COMPLEXITY.items():
    if key in task_l:
        matched = vals
        break

# Count files mentioned or in scope
file_matches = re.findall(r'\b\S+\.(py|ts|tsx|js|sh|md|json|yaml|yml)\b', task_desc)
file_bonus   = len(set(file_matches)) * 2000

# Current budget state
budget_file  = state / 'token-budget.json'
tokens_used  = 0
budget_limit = 200000
if budget_file.exists():
    try:
        b = json.loads(budget_file.read_text())
        tokens_used  = b.get('total_tokens_used', 0)
        budget_limit = b.get('budget_tokens', 200000)
    except Exception:
        pass

est_in  = matched['in'] + file_bonus
est_out = matched['out']
est_total = est_in + est_out
est_cost  = (est_in / 1_000_000 * INPUT_COST_PER_MTK) + (est_out / 1_000_000 * OUTPUT_COST_PER_MTK)

remaining_budget = budget_limit - tokens_used
pct_of_remaining = (est_total / remaining_budget * 100) if remaining_budget > 0 else 999

print()
print('  ╔══════════════════════════════════════════════╗')
print('  ║          YAMTAM COST FORECAST                ║')
print('  ╚══════════════════════════════════════════════╝')
print()
print(f'  Task type      : {matched["label"]}')
if task_desc:
    short = task_desc[:60] + ('...' if len(task_desc) > 60 else '')
    print(f'  Task           : {short}')
if file_matches:
    print(f'  Files detected : {len(set(file_matches))} (+{file_bonus:,} tokens)')
print()
print(f'  Est. input     : {est_in:>10,} tokens  (${est_in/1e6*INPUT_COST_PER_MTK:.4f})')
print(f'  Est. output    : {est_out:>10,} tokens  (${est_out/1e6*OUTPUT_COST_PER_MTK:.4f})')
print(f'  Est. total     : {est_total:>10,} tokens  (${est_cost:.4f} USD)')
print()
print(f'  Budget used    : {tokens_used:>10,} / {budget_limit:,}')
print(f'  Remaining      : {remaining_budget:>10,} tokens')
print(f'  Task % of rem  : {pct_of_remaining:.1f}%')
print()

if pct_of_remaining > 80:
    print('  ⚠️  WARNING: Task may exhaust remaining budget')
elif pct_of_remaining > 50:
    print('  🟡 CAUTION: Large portion of remaining budget')
else:
    print('  ✅ Budget looks sufficient for this task')
print()
print('  Note: Estimates are heuristic-based. Actual cost varies.')
print()
```

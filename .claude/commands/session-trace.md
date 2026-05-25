---
description: Render an ASCII timeline of the current session — shows every tool call, hook decision, risk score, and block event in chronological order. Usage: /session-trace [--tail N | --filter block|warn|allow]
argument-hint: [--tail N | --filter block|warn|allow | --since HH:MM]
---

You are the Session Tracer. Your job is to read the audit log and render a clear, scannable timeline of what happened in this session.

---

## Step 1 — Parse arguments

- `--tail N` → show last N entries (default: 50)
- `--filter block` → show only blocked actions
- `--filter warn` → show warnings and blocks
- `--filter allow` → show all allowed actions
- `--since HH:MM` → show entries from that time onward

---

## Step 2 — Read audit log

```bash
AUDIT_LOG=".claude/state/audit-chain.log"
RISK_LOG=".claude/state/risk-scores.jsonl"

# Count entries
wc -l "$AUDIT_LOG" 2>/dev/null || echo "Audit log not found"

# Show last N entries
tail -${N:-50} "$AUDIT_LOG" 2>/dev/null | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        e = json.loads(line.strip())
        ts    = e.get('ts','?')[-8:]  # HH:MM:SS
        hook  = e.get('hook','?')[:20]
        tool  = e.get('tool','?')[:25]
        dec   = e.get('decision','?')
        band  = ''
        icon  = '✓' if dec == 'allow' else '⚠' if dec == 'warn' else '✗'
        print(f'  {ts}  {icon}  {hook:<22} {tool:<27} {dec}')
    except:
        pass
"
```

---

## Step 3 — Read risk scores (if available)

```bash
tail -20 ".claude/state/risk-scores.jsonl" 2>/dev/null | python3 -c "
import sys, json
print()
print('  Risk scores (last 20 tool calls):')
print('  ─────────────────────────────────────────────────────')
for line in sys.stdin:
    try:
        e = json.loads(line.strip())
        ts    = e.get('ts','?')[-8:]
        tool  = e.get('tool','?')[:20]
        score = e.get('score', 0)
        band  = e.get('band','?')
        icons = {'LOW':'✅','MEDIUM':'⚠️ ','HIGH':'🔶','CRITICAL':'🛑'}
        icon  = icons.get(band,'?')
        bar   = '█' * (score // 10) + '░' * (10 - score // 10)
        print(f'  {ts}  {icon} {band:<8} [{bar}] {score:>3}/100  {tool}')
    except:
        pass
"
```

---

## Step 4 — Render checkpoint index

```bash
python3 -c "
import json, os
idx_f = '.claude/state/checkpoints/index.json'
if os.path.exists(idx_f):
    idx = json.load(open(idx_f))
    cps = idx.get('checkpoints', [])
    print()
    print(f'  Checkpoints this session: {len(cps)}')
    for cp in cps[-5:]:
        print(f'  ├─ {cp[\"id\"]}  [{cp[\"label\"]}]  {cp[\"created_at\"]}')
else:
    print('  No checkpoints yet')
" 2>/dev/null
```

---

## Step 5 — Session summary

```bash
python3 -c "
import json, os
state = '.claude/state'
budget_f = os.path.join(state, 'token-budget.json')
trust_f  = os.path.join(state, 'session-trust.json')

budget = json.load(open(budget_f)) if os.path.exists(budget_f) else {}
trust  = json.load(open(trust_f))  if os.path.exists(trust_f)  else {}

print()
print('  Session summary:')
print(f'  Tokens used    : {budget.get(\"total_tokens_used\", 0):,}')
print(f'  Trust score    : {trust.get(\"score\", 100)}/100')
print(f'  Last risk band : {budget.get(\"last_risk_band\", \"—\")}')
print(f'  Last risk score: {budget.get(\"last_risk_score\", \"—\")}')
" 2>/dev/null
```

---

## Step 6 — Flag anomalies

After rendering, check for:

1. More than 3 CRITICAL blocks in session → warn: "High block rate — consider reviewing task scope"
2. Trust score < 60 → warn: "Trust score low — double-evidence required on all claims"
3. No checkpoints after 20+ tool calls → suggest: "Consider running /checkpoint now"
4. Last risk score ≥ 85 → warn: "Last action was CRITICAL risk — verify it completed safely"

Report findings. If no anomalies: "Session looks clean."

---
description: Estimate token cost before starting a large task — analyze scope, estimate tool calls, project token usage and USD cost. Usage: /cost-forecast [task description]
argument-hint: [description of the task you're about to do]
---

You are the Cost Forecaster. Your job is to estimate token usage and USD cost before a task begins — so the sovereign can make an informed decision about scope and model tier.

---

## Step 1 — Understand the task

If `$ARGUMENTS` provided: use it as the task description.
Otherwise ask: "What task are you planning? Describe the scope briefly."

---

## Step 2 — Analyze current session cost

```bash
cat "core/memory/L2_session/token-budget.json" 2>/dev/null | python3 -c "
import json, sys
d = json.load(sys.stdin)
used = d.get('total_tokens_used', 0)
print(f'Tokens used so far: {used:,}')
print(f'Session start: {d.get(\"session_start\",\"unknown\")}')
" 2>/dev/null || echo "No budget file yet"
```

---

## Step 3 — Estimate task complexity

Score the task on these dimensions:

| Dimension | Low (1pt) | Medium (3pt) | High (5pt) |
|-----------|-----------|--------------|------------|
| Files to read | 1–5 | 6–20 | 20+ |
| Files to write/edit | 0–2 | 3–10 | 10+ |
| Test suite to run | none | unit only | E2E + unit |
| External tools | none | 1–2 MCP calls | 3+ services |
| Reasoning depth | simple fix | feature build | architecture |

**Total score → tier:**
- 5–9 pts → **Light** (~5K–20K tokens, ~$0.01–0.05)
- 10–14 pts → **Medium** (~20K–80K tokens, ~$0.05–0.20)
- 15–19 pts → **Heavy** (~80K–200K tokens, ~$0.20–0.60)
- 20–25 pts → **Very Heavy** (~200K+ tokens, ~$0.60+)

---

## Step 4 — Tool call breakdown estimate

Estimate how many of each tool call type will occur:

| Tool | Estimated calls | Tokens each | Subtotal |
|------|----------------|-------------|---------|
| Read file | N | ~500 | N×500 |
| Write file | N | ~1000 | N×1000 |
| Bash command | N | ~300 | N×300 |
| Reasoning turn | N | ~2000 | N×2000 |
| **Total** | | | **~XX,XXX** |

---

## Step 5 — Model recommendation

Based on task complexity:

- **Light / Medium** → `claude-haiku-4-5` — fast, cheap, sufficient for routine tasks
- **Heavy** → `claude-sonnet-4-6` — default, good balance
- **Very Heavy + architecture** → `claude-opus-4-6` — use sparingly, costs 5x

Current model active: check `ANTHROPIC_MODEL` env or assume Sonnet.

---

## Step 6 — Report and recommend

```
=== /cost-forecast ===
Task         : [description]
Complexity   : [Light | Medium | Heavy | Very Heavy] ([score]/25)

Estimated usage:
  Tool calls  : ~N
  Tokens      : ~XX,XXX
  USD cost    : ~$X.XX (at Sonnet rate)

Session so far: XX,XXX tokens (~$X.XX)
Projected total: ~XX,XXX tokens (~$X.XX)

Recommendation:
  Model    : [model]
  Split?   : [Yes — split into N sub-tasks | No — fits in one session]
  Checkpoint: [Before starting / After each major step / At the end]

To reduce cost:
  - [specific suggestion based on task]
  - Use /budget-mode on to restrict heavy operations
```

If projected total > 150K tokens: add warning and suggest splitting the task.

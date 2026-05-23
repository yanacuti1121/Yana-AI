---
description: Real-time token cost dashboard from token-budget.json + session JSONL. Shows per-tool call counts, circuit breaker state, loop attempts, and fast-tier activations. Usage — /cost-report [--all]
argument-hint: --all
---

You are generating a YAMTAM cost report from local session data.

No API calls. No external data. All numbers come from local files.

---

## Step 1 — Read token-budget.json

Use the Bash tool to run:

```bash
python3 - <<'EOF'
import json, os, sys
from datetime import datetime, timezone

project_root = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())
budget_file = os.path.join(project_root, 'core/memory/L2_session/token-budget.json')
circuit_file = os.path.join(project_root, 'core/memory/L2_session/circuit-state.json')

# ── Token budget ──────────────────────────────────────────────────────────────
if os.path.exists(budget_file):
    with open(budget_file) as f:
        budget = json.load(f)

    session_start = budget.get('session_start', 'unknown')
    total_tokens = budget.get('total_tokens_used', 0)
    actions = budget.get('actions', [])
    loop_attempts = budget.get('loop_attempts', {})
    fast_tier = budget.get('fast_tier_triggered', False)

    # Per-tool breakdown
    tool_counts = {}
    for a in actions:
        t = a.get('tool', 'unknown')
        tool_counts[t] = tool_counts.get(t, 0) + 1

    # Cost estimate: Sonnet 4.5 pricing (~$3/MTok input, ~$15/MTok output)
    # token-budget.json tracks total — assume 70/30 input/output split
    est_input = int(total_tokens * 0.7)
    est_output = int(total_tokens * 0.3)
    est_cost_usd = (est_input / 1_000_000 * 3.0) + (est_output / 1_000_000 * 15.0)

    print("=" * 52)
    print("  YAMTAM COST REPORT — Current Session")
    print("=" * 52)
    print(f"  Session start    : {session_start}")
    print(f"  Total tokens     : {total_tokens:,}")
    print(f"  Est. cost (USD)  : ${est_cost_usd:.4f}")
    print(f"  Fast-tier active : {'YES ⚡' if fast_tier else 'no'}")
    print()
    if tool_counts:
        print("  Per-tool call counts:")
        for tool, count in sorted(tool_counts.items(), key=lambda x: -x[1]):
            print(f"    {tool:<25} {count:>4} call(s)")
    if loop_attempts:
        print()
        print("  Loop attempt counts:")
        for tool, count in sorted(loop_attempts.items(), key=lambda x: -x[1]):
            flag = " ⚠" if count >= 3 else ""
            print(f"    {tool:<25} {count:>4} attempt(s){flag}")
else:
    print("  [token-budget] No active session budget found.")
    print(f"  (looked at: {budget_file})")

# ── Circuit breaker state ─────────────────────────────────────────────────────
print()
if os.path.exists(circuit_file):
    with open(circuit_file) as f:
        circuit = json.load(f)
    state = circuit.get('state', 'UNKNOWN')
    open_count = circuit.get('open_count', 0)
    tool = circuit.get('tool', 'n/a')
    print(f"  Circuit Breaker  : {state}")
    if state == 'OPEN':
        print(f"  ⛔  Blocked tool : {tool} (open_count={open_count})")
        print(f"  ⛔  Unblock with : YAMTAM_BUDGET_BYPASS=1 (sovereign only)")
    elif state == 'HALF-OPEN':
        print(f"  ⚠  Half-open    : {tool} — one probe allowed")
else:
    print("  Circuit Breaker  : CLOSED (no state file)")

print()
print("=" * 52)
EOF
```

---

## Step 2 — Present the output

Present the script output verbatim. Do not modify any numbers.

---

## Step 3 — Recommendations

After the report, apply these rules:

| Condition | Recommendation |
|---|---|
| total_tokens > 40,000 | "Approaching loop limit (50K). Consider /checkpoint." |
| est_cost_usd > $0.10 | "Session cost notable. Run /output-budget for bloat check." |
| circuit_state == OPEN | "Circuit OPEN — resolve the blocked tool or set YAMTAM_BUDGET_BYPASS=1." |
| fast_tier == YES | "Fast-tier active. Claude will route future calls to Haiku." |
| loop_attempts any ≥ 4 | "Tool attempted ≥4 times. Review why it keeps being called." |

---

## Constraints

- Do NOT round or modify numbers from the script.
- Do NOT call any external API.
- Do NOT claim these are billing-verified figures — they are local session counters.
- If token-budget.json is missing, say: "No budget data for this session. The budget initializes on first tool call."

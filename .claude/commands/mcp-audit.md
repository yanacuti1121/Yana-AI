---
description: Audit MCP server usage and recommend tier classification to reduce MCP Tax (per arXiv 2604.21816). Reads tool-attention session log, computes per-server utilization, and proposes which MCP servers should move from .mcp.json (always loaded) to on-demand tier. Usage — /mcp-audit
---

You are running an MCP audit. Goal — reduce per-turn token overhead from MCP
schema injection (the "MCP Tax"). Practitioner reports place this overhead at
10k–60k tokens per turn in typical multi-server deployments. Servers that get
loaded but never invoked are pure cost.

## Phase 1 — Read the data

1. Read `.claude/mcp-tier.json` to see current tier classification.
2. Read `.mcp.json` to see what servers are actively configured.
3. Check `/tmp/claude-tool-attn-*.json` files for tool-attention session logs.
   These hold per-tool call counts from the tool-attention hook.
4. If no session logs exist yet, tell the user "no usage data yet — run a few
   real sessions before auditing" and stop.

## Phase 2 — Compute utilization

For each MCP server in `.mcp.json`:

1. Sum tool calls across all session logs (group by `mcp__<server>__*` prefix).
2. Compute total tool calls across all sessions.
3. Compute per-50-call usage rate — `(server_calls / total_calls) * 50`.

## Phase 3 — Recommend

Apply these rules — read from `.claude/mcp-tier.json` thresholds — but default to:

- **Keep in core** — server averages ≥ 5 calls per 50 tool invocations
- **Move to on-demand** — server averages < 5 calls per 50 tool invocations
- **Consider removing** — server has 0 calls across all logged sessions

Write the audit report to `docs/mcp-audit-YYYY-MM-DD.md` with this structure —

```markdown
# MCP Audit — [date]

## Sessions analyzed
- N sessions, M total tool calls

## Server utilization

| Server | Calls | Per-50-rate | Current tier | Recommended |
|--------|-------|-------------|--------------|-------------|
| ...    | ...   | ...         | ...          | ...         |

## Recommendations

1. [Specific action — e.g. "Move `context7` to on-demand: 0 calls in 3 sessions"]
2. ...

## Estimated token savings

[If recommendations applied — estimate tokens saved per turn. Use 5k–20k per
removed server as a rough range, citing arXiv 2604.21816.]
```

## Phase 4 — Ask before applying

Show the report. Then ask — "Apply these changes to `.mcp.json` and
`.claude/mcp-tier.json`? (yes/no)". Only modify config files after explicit
yes. Never edit `.mcp.json` silently.

## Constraints

- Never invent usage numbers — read from session logs only.
- If only one session exists — flag that the sample size is too small to act on.
- Don't recommend removing a server based on a single session's data.

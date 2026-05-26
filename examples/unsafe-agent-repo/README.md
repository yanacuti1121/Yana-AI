# unsafe-agent-repo

**This repo is intentionally misconfigured.** Every file here contains real anti-patterns
that `yamtam audit` is designed to catch. Use it to demo the scanner or to explore what
bad AI agent configuration looks like in practice.

> All credentials are fake/test values. No real keys were committed.

---

## What's in here

| File | Problems introduced |
|------|---------------------|
| `.claude/settings.json` | `Bash(*)` wildcard, `dangerouslyAllowAll: true`, no model pin |
| `.mcp.json` | Filesystem MCP with full `/` access, DB server with hardcoded password, unknown remote MCP URL |
| `.github/workflows/ai-pr.yml` | `pull_request_target`, auto-merge with 0 approvals, `curl \| bash` install, secrets echoed |
| `scripts/deploy.sh` | `rm -rf $VAR`, `curl \| bash`, `chmod 777`, `eval "$(cat ...)"`, no `set -e` |
| `.env` | Fake Anthropic, OpenAI, Stripe, and DB credentials |

---

## Run the audit

From the **repo root** (not this directory):

```bash
yamtam audit examples/unsafe-agent-repo
```

Or with the Python scanner directly:

```bash
python3 core/scripts/audit_scanner.py examples/unsafe-agent-repo
```

With SARIF output (for GitHub Code Scanning):

```bash
yamtam audit examples/unsafe-agent-repo --sarif /tmp/unsafe.sarif
```

---

## Expected output

```
Score:    0 / 100
Risk:     CRITICAL

Summary:  14 critical · 9 high · 6 medium · 4 low
```

### Findings breakdown

| Rule | Severity | File | What it catches |
|------|----------|------|-----------------|
| AC002 | CRITICAL | `.claude/settings.json` | `Bash(*)` wildcard shell access |
| AC003 | HIGH | `.claude/settings.json` | `dangerouslyAllowAll: true` |
| AC005 | LOW | `.claude/settings.json` | No model pinned |
| CI001 | CRITICAL ×4 | `.github/workflows/ai-pr.yml` | Auto-merge, no approval gate |
| CI004 | HIGH | `.github/workflows/ai-pr.yml` | Secret echoed in step |
| CI005 | HIGH | `.github/workflows/ai-pr.yml` | `curl \| bash` install |
| CI006 | MEDIUM | `.github/workflows/ai-pr.yml` | Unpinned action SHA |
| CI007 | MEDIUM ×2 | `.github/workflows/ai-pr.yml` | No `permissions:` block |
| CI010 | LOW ×2 | `.github/workflows/ai-pr.yml` | No `timeout-minutes` |
| DB001 | CRITICAL | `.mcp.json` | Raw SQL MCP, no read-only policy |
| DB002 | CRITICAL | `.mcp.json` | DB write/admin access |
| DB003 | HIGH | `.mcp.json` | No `allowed_schemas` list |
| DB006 | MEDIUM | `.mcp.json` | No query timeout |
| DB008 | LOW | `.mcp.json` | No audit logging |
| MCP001 | CRITICAL | `.mcp.json` | Filesystem MCP at `/` |
| MCP003 | HIGH | `.mcp.json` | Unknown remote MCP vendor |
| MCP006 | MEDIUM | `.mcp.json` | No tool scope declared |
| MCP009 | CRITICAL | `.mcp.json` | DB MCP, no read-only flag |
| SE001 | CRITICAL | `.env:5` | Anthropic API key pattern |
| SE002 | CRITICAL ×2 | `.env:5-6` | OpenAI API key pattern (`sk-proj-`, `sk-`) |
| SE006 | HIGH | `.env:8` | Stripe secret key (key modified to avoid GitHub push protection) |
| SH001 | CRITICAL | `scripts/deploy.sh:9` | `rm -rf $VAR` (unquoted) |
| SH002 | CRITICAL | `scripts/deploy.sh:12` | `curl \| bash` |
| SH003 | HIGH ×2 | `scripts/deploy.sh:15-16` | `chmod 777` |
| SH005 | HIGH | `scripts/deploy.sh:19` | `eval "$(cat ...)"` |
| SH007 | HIGH | `scripts/deploy.sh:9` | Unquoted variable in `rm` |
| SH008 | MEDIUM | `scripts/deploy.sh:1` | No `set -euo pipefail` |

---

## What a secure version looks like

See the scanner rules in `scanner/` for the recommended fix for each rule ID, or run:

```bash
yamtam audit examples/unsafe-agent-repo --markdown report.md
```

The generated `report.md` includes a fix suggestion for every finding.

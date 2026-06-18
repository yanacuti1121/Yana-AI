# CLI MVP Design — `yana-ai audit`

**Status:** Design (pre-implementation)  
**Phase:** v0.1  
**Constraint:** Docs/schema/rules only — no code yet

---

## Command Structure

```
yana-ai <command> [target] [flags]
```

### v0.1 commands

```
yana-ai audit [target]     Run the agent setup audit
yana-ai version            Print version
yana-ai help               Print help
```

`target` defaults to `.` (current directory).

---

## `yana-ai audit` Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--json` | bool | false | Output findings as JSON |
| `--markdown <file>` | string | — | Write Markdown report to file |
| `--fail-on <level>` | enum | — | Exit non-zero if findings at this level+ exist |
| `--only <category>` | string | — | Run only one scanner (agent-config, shell-risk, mcp-permission, ci-workflow, secret-exposure) |
| `--ignore <id>` | string[] | — | Suppress specific finding IDs (e.g. SE013) |
| `--no-color` | bool | false | Disable ANSI color output |
| `--quiet` | bool | false | Only print score + risk level (no findings list) |

---

## Console Output Spec

### Full output (default)

```
┌─────────────────────────────────────────────────────┐
│  Yana AI Agent Audit Report                          │
│  v0.1.0 · github.com/yanacuti1121/yana-ai │
└─────────────────────────────────────────────────────┘

Target:   .
Scanned:  14 files  ·  5 scanners  ·  48 checks

Score:    41 / 100
Risk:     HIGH

Findings:
──────────────────────────────────────────────────────
[CRITICAL] AC002  .claude/settings.json:8
           allowedTools contains Bash(*) — wildcard shell access
           Fix: Replace Bash(*) with scoped entries like Bash(git status)

[HIGH]     CI001  .github/workflows/ai-pr.yml:34
           auto-merge has no approval gate
           Fix: Add required-reviewers: 1 before auto-merge triggers

[HIGH]     MCP001 .mcp.json:12
           filesystem server has root-level access (path: /)
           Fix: Scope to project directory only

[MED]      SH002  scripts/setup.sh:7
           postinstall runs remote shell via curl|bash
           Fix: Download, verify SHA256, then execute separately

[LOW]      SH008  scripts/deploy.sh:1
           set -e missing — errors silently ignored
           Fix: Add 'set -euo pipefail' after shebang

──────────────────────────────────────────────────────
Summary:  1 critical · 2 high · 1 medium · 1 low

Run with --markdown report.md to export.
Run with --fail-on high for CI use.
```

### Quiet mode (`--quiet`)

```
Score: 41/100  |  Risk: HIGH  |  5 findings (1 critical, 2 high, 1 medium, 1 low)
```

### Clean output

```
Score: 97/100  |  Risk: LOW  |  No findings above LOW

✓ .claude/settings.json — OK
✓ .mcp.json — OK
✓ .github/workflows/ — OK
✓ package.json — OK
✓ .env — OK
```

---

## JSON Output Spec (`--json`)

Conforms to `reports/report.schema.json`.

```json
{
  "schema_version": "0.1.0",
  "generated_at": "2026-05-26T10:30:00Z",
  "target": ".",
  "score": 41,
  "risk_level": "HIGH",
  "summary": {
    "total": 5,
    "critical": 1,
    "high": 2,
    "medium": 1,
    "low": 1
  },
  "findings": [
    {
      "id": "AC002",
      "severity": "CRITICAL",
      "category": "agent-config",
      "file": ".claude/settings.json",
      "line": 8,
      "rule": "agent-config/wildcard-bash",
      "reason": "allowedTools contains Bash(*) — wildcard shell access lets agent run any command",
      "fix": "Replace Bash(*) with scoped entries like Bash(git status)",
      "confidence": "HIGH"
    }
  ]
}
```

---

## Exit Code Contract

```
0  →  Score ≥ 90 (LOW risk) or no findings above --fail-on threshold
1  →  MEDIUM or HIGH findings (default --fail-on behavior)
2  →  CRITICAL findings present
3  →  Scanner error (parse failure, unreadable file, invalid YAML rule)
```

When `--fail-on critical`: exit 0 unless CRITICAL findings exist.  
When `--fail-on high`: exit 1 if HIGH or CRITICAL findings exist.  
When `--fail-on medium`: exit 1 if MEDIUM, HIGH, or CRITICAL findings exist.

---

## GitHub Actions Integration Example

```yaml
# .github/workflows/yana-ai-audit.yml
name: Yana AI Agent Audit

on:
  push:
    branches: [main]
  pull_request:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Yana AI
        run: |
          curl -sSL https://raw.githubusercontent.com/yanacuti1121/yana-ai/main/install.sh | bash
      
      - name: Run audit
        run: yana-ai audit . --fail-on high --markdown audit-report.md
      
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: yana-ai-audit-report
          path: audit-report.md
```

---

## Scanner Loading Order

```
1. Load rule YAML files from scanner/*.yml
2. Resolve file_patterns → list of target files
3. For each file × each check: run match logic
4. Collect findings → compute score → determine risk_level
5. Sort findings: CRITICAL first, then HIGH, MED, LOW
6. Render output in requested format
```

---

## Error Handling

| Condition | Behavior |
|-----------|----------|
| Target directory not found | Exit 3, print "Error: target not found: <path>" |
| Scanner rule YAML parse error | Skip that scanner, print warning, continue |
| File unreadable (permissions) | Skip file, add INFO finding noting the skip |
| JSON file malformed | Mark finding as LOW confidence, continue |
| No scanners loaded | Exit 3, print "Error: no scanner rules found in scanner/" |

---

## Out of Scope (v0.1)

- Auto-fix — show findings only
- Custom rule authoring — built-in rules only
- Remote scanning (scan a GitHub URL) — local only
- IDE plugin — CLI only
- LLM-assisted analysis — rule-based only

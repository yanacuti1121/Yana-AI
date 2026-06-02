export const TEMPLATES: Record<string, string> = {
  'CLAUDE.md': `# YAMTAM ENGINE — Agent Safety Rules

> Installed via YAMTAM GitHub App. Edit to customize.

## Core Rules

**1. Evidence before claims**
Before using: done, finished, complete, passed, fixed, verified, shipped —
show actual output: git log, test count, build output, CI log.

**2. Scope discipline**
Before any write/commit/push: report files you will touch + risk level.
Wait for approval if risk ≥ commit.

**3. Hard blocks — never run, never propose**
\`\`\`
rm -rf    git push --force    DROP TABLE    TRUNCATE
\`\`\`

**4. When uncertain — stop and ask**
State what you would do, why you are unsure, ask one specific question.

**5. Truth in reporting**
Never invent file paths, command outputs, or test results.

## Code Standards
- Function length: ≤ 50 lines
- File length: ≤ 300 lines
- Nesting depth: ≤ 3 levels
- No \`any\` in TypeScript
- No hardcoded secrets — use env vars

## Git Workflow
\`\`\`
feat | fix | refactor | docs | test | chore | perf | ci
\`\`\`
No force-push. Ever.
`,

  '.claude/settings.json': JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{
            type: 'command',
            command: 'bash .claude/hooks/guard-destructive.sh 2>/dev/null || true'
          }]
        }
      ],
      PostToolUse: [
        {
          matcher: '.*',
          hooks: [{
            type: 'command',
            command: 'bash .claude/hooks/audit-log.sh 2>/dev/null || true'
          }]
        }
      ]
    }
  }, null, 2),

  '.claude/hooks/guard-destructive.sh': `#!/usr/bin/env bash
# YAMTAM guard — blocks destructive commands
BLOCKED_PATTERNS=("rm -rf" "git push --force" "git push -f" "DROP TABLE" "TRUNCATE" "dd if=")
CMD="\${CLAUDE_TOOL_INPUT:-}"
for pattern in "\${BLOCKED_PATTERNS[@]}"; do
  if echo "\$CMD" | grep -qi "\$pattern"; then
    echo "[yamtam/guard] BLOCKED: \$pattern detected"
    exit 2
  fi
done
`,

  '.claude/hooks/audit-log.sh': `#!/usr/bin/env bash
# YAMTAM audit — logs all tool calls
LOG=".claude/state/audit.log"
mkdir -p .claude/state
echo "\$(date -u +%Y-%m-%dT%H:%M:%SZ) | tool=\${CLAUDE_TOOL_NAME:-unknown} | \${CLAUDE_TOOL_INPUT:0:120}" >> "\$LOG"
`,

  '.claude/rules/golden-principles.md': `# Golden Principles

1. **Evidence before claims** — show output before claiming done
2. **Secrets in env vars** — never hardcode tokens/keys
3. **Small files, small functions** — 300 lines/file, 50 lines/function max
4. **Validate at boundaries** — user input, external APIs
5. **Surgical changes** — only change what was requested
6. **No commented-out code** — delete or track in TODO
`,
};

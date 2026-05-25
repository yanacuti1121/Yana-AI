---
name: cyclomatic-complexity
description: Cyclomatic complexity measurement for JavaScript/TypeScript. Function complexity scoring, threshold enforcement, refactor detection, and per-file complexity reports. Sources: marcondescruza/node-complexity (MIT).
origin: yamtam-engine — synthesized from marcondescruza/node-complexity (MIT), McCabe complexity literature
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /cyclomatic-complexity

## When to Use

- Detect functions that are too complex to safely modify (complexity > 10 = refactor candidate)
- CI gate: fail builds when new code exceeds complexity threshold
- Tech-debt triage: rank functions by complexity to prioritize refactoring
- Pair with [[eslint-rule-engine]] for inline complexity warnings during coding

## Do NOT use for

- Code correctness analysis (complexity ≠ correctness)
- Python complexity measurement (use radon: `radon cc -s src/`)

---

## Cyclomatic complexity formula

```
CC = Edges − Nodes + 2 * ConnectedComponents
   = 1 + (number of decision points)
```

Decision points: `if`, `else if`, `?:`, `&&`, `||`, `switch case`, `while`, `for`, `for-in`, `for-of`, `catch`

Thresholds:
- **1–5**: simple, easy to test
- **6–10**: moderate, test all paths
- **11–20**: complex, refactor soon
- **21+**: untestable, must split

---

## Measure with ESLint complexity rule

```javascript
// eslint.config.js
export default [
  {
    rules: {
      complexity: ['error', { max: 10 }],  // fail if CC > 10
    },
    files: ['src/**/*.{js,ts}'],
  },
]
```

---

## Manual AST-based complexity scorer

```javascript
import { parse } from 'acorn'

const DECISION_NODES = new Set([
  'IfStatement', 'ConditionalExpression', 'SwitchCase',
  'WhileStatement', 'DoWhileStatement',
  'ForStatement', 'ForInStatement', 'ForOfStatement',
  'CatchClause',
])
const LOGICAL_OPS = new Set(['&&', '||', '??'])

function measureComplexity(fnSource: string): number {
  const ast = parse(`(${fnSource})`, { ecmaVersion: 2022 })
  let cc = 1

  function walk(node: any) {
    if (!node || typeof node !== 'object') return
    if (DECISION_NODES.has(node.type)) cc++
    if (node.type === 'LogicalExpression' && LOGICAL_OPS.has(node.operator)) cc++
    for (const key of Object.keys(node)) {
      const child = node[key]
      if (Array.isArray(child)) child.forEach(walk)
      else if (child?.type)      walk(child)
    }
  }
  walk(ast)
  return cc
}

console.log(measureComplexity('function f(x) { if (x > 0 && x < 10) return x * 2; return 0 }'))
// → 3 (1 base + 1 if + 1 &&)
```

---

## File-level complexity report

```bash
#!/usr/bin/env bash
# complexity-report.sh — list functions with CC > threshold
THRESHOLD=${1:-10}

npx eslint --format json src/**/*.{js,ts} 2>/dev/null \
  | jq --argjson t "$THRESHOLD" '
      [.[] | .messages[]
       | select(.ruleId == "complexity" and .severity == 2)
       | { file: .filePath? // "?", line: .line, message }
      ] | sort_by(.line)
    '
```

---

## Cognitive complexity (human readability score)

```javascript
// Cognitive complexity penalizes nesting more than CC
// Rule: @typescript-eslint/cognitive-complexity
export default [
  {
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/cognitive-complexity': ['warn', 15],
    },
  },
]
```

---

## Anti-Fake-Pass Checklist

```
❌ Measuring CC on minified code → all complexity reported as 1 (single "function")
❌ Ignoring ?? and ?. operators → modern JS complexity undercounted
❌ Threshold too low (≤5) for utility functions → alert fatigue from false positives
❌ Only measuring per-file, not per-function → complex helper buried in a simple file
❌ CC = 1 doesn't mean easy to test — 1 path through deeply nested callbacks is still hard
❌ Skipping CatchClause in walker → error-handling branches missed from score
```

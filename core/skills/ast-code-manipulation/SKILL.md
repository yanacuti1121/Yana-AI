---
name: ast-code-manipulation
description: AST-based code reading, analysis, and mutation for AI agents. JavaScript AST parsing with espree/acorn, AST-to-code generation with escodegen, large-source string editing with magic-string and source maps, CSS AST walking with PostCSS. Never use regex for structural code transforms — use AST. Sources: eslint/espree, acornjs/acorn, estools/escodegen, rich-harris/magic-string, postcss/postcss.
origin: yamtam-engine — synthesized from eslint/espree, acornjs/acorn, estools/escodegen, rich-harris/magic-string, postcss/postcss
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.46
---

# /ast-code-manipulation

## When to Use

- Reading, analyzing, or modifying JavaScript/TypeScript structure (not text)
- "Find all function calls to X and rename them" — regex will break, AST won't
- Injecting code at a precise AST node without corrupting surrounding syntax
- Editing CSS at the property level while preserving formatting
- Generating a source map alongside a code transform

## Do NOT use for

- Simple substring replace (no structural meaning — use string.replace())
- Extracting a comment from the top of a file (line regex is fine)

---

## Decision: espree vs acorn

```
Need ESLint-compatible AST (includes range, loc, tokens by default)?
  YES → espree (ESLint's own parser, adds scope analysis)
  NO  →
    Need JSX / TypeScript support?
      YES → @typescript-eslint/parser (built on espree)
      Need absolute minimum size + speed?
        YES → acorn (3KB, no extras, backbone of Webpack/Rollup/Vite)
```

---

## Parse JavaScript → AST (espree)

```typescript
import espree from 'espree'

const code = `
  import { runAgent } from './agent'
  async function main() {
    const result = await runAgent({ task: 'summarize', depth: 3 })
    return result
  }
`

const ast = espree.parse(code, {
  ecmaVersion:  2022,
  sourceType:   'module',
  range:        true,    // [start, end] byte offsets — needed for magic-string
  loc:          true,    // { line, column } — needed for source maps
  tokens:       true,    // token list — needed for linting
  comment:      true,    // preserve comments in AST
})

// Walk the AST — find all CallExpression nodes
function walk(node: any, visitor: (node: any) => void) {
  if (!node || typeof node !== 'object') return
  visitor(node)
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue  // skip parent refs to avoid cycles
    const child = node[key]
    if (Array.isArray(child)) child.forEach(c => walk(c, visitor))
    else if (child?.type)     walk(child, visitor)
  }
}

const calls: string[] = []
walk(ast, (node) => {
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
    calls.push(node.callee.name)
  }
})
// calls = ['runAgent']

// Rule: always set range: true when you'll use magic-string for transforms
// Rule: walk() must skip 'parent' backrefs — espree adds them, cycles crash DFS
```

---

## Fast Parse (acorn)

```typescript
import * as acorn from 'acorn'

// Acorn: same ESTree AST, ~3× smaller than espree, no extras
const ast = acorn.parse(code, {
  ecmaVersion: 2022,
  sourceType:  'module',
  locations:   true,   // adds .loc to nodes
  ranges:      true,   // adds .start / .end byte offsets
})

// acorn-walk for targeted traversal (no manual recursion)
import * as walk from 'acorn-walk'

walk.simple(ast, {
  ImportDeclaration(node) {
    console.log('import from:', (node as any).source.value)
  },
  FunctionDeclaration(node) {
    console.log('function:', (node as any).id?.name)
  },
})

// Rule: use acorn-walk.simple() for single-pass node-type targeting
// Rule: use acorn-walk.ancestor() when you need the parent chain
```

---

## AST → Code (escodegen)

```typescript
import escodegen from 'escodegen'
import * as acorn from 'acorn'

const code = `function greet(name) { return 'Hello, ' + name }`
const ast  = acorn.parse(code, { ecmaVersion: 2022 }) as any

// Find the function body and add a console.log before return
const funcBody = ast.body[0].body.body  // [ReturnStatement]
funcBody.unshift({
  type: 'ExpressionStatement',
  expression: {
    type:      'CallExpression',
    callee:    { type: 'MemberExpression', object: { type: 'Identifier', name: 'console' },
                 property: { type: 'Identifier', name: 'log' }, computed: false },
    arguments: [{ type: 'Literal', value: '[greet called]', raw: "'[greet called]'" }],
  },
})

const output = escodegen.generate(ast, {
  format: {
    indent:     { style: '  ' },
    semicolons: true,
  },
  sourceMap:       'greet.js',    // filename for source map
  sourceMapWithCode: true,        // return both code + map
})

// output.code + output.map (SourceMapGenerator instance)
// Rule: escodegen.generate(ast) is deterministic — same AST = same output
// Rule: inject nodes via unshift/push on body arrays, never string-splice
```

---

## Large-File String Editing (magic-string)

```typescript
import MagicString from 'magic-string'
import espree from 'espree'

const source = `export const VERSION = "1.3.45"\nexport function run() {}`
const s      = new MagicString(source)

const ast = espree.parse(source, { ecmaVersion: 2022, sourceType: 'module', range: true })

// Find the string literal "1.3.45" and replace it
espree.parse(source, { ecmaVersion: 2022, sourceType: 'module', range: true, tokens: true })

let found = false
function walk(node: any) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'Literal' && node.value === '1.3.45') {
    s.overwrite(node.range![0], node.range![1], '"1.3.46"')  // byte-precise replace
    found = true
  }
  for (const key of Object.keys(node)) {
    if (Array.isArray(node[key])) node[key].forEach(walk)
    else if (node[key]?.type) walk(node[key])
  }
}
walk(ast)

// Append new export
s.append('\nexport const PATCH_DATE = "2026-05-22"')

// Prepend banner
s.prepend('/* auto-generated — do not edit */\n')

const result = s.toString()
const map    = s.generateMap({ source: 'version.ts', includeContent: true, hires: true })
// map.toString() → inline-able sourceMappingURL data

// Rule: overwrite(start, end, str) uses the original byte offsets from AST range
// Rule: never mix s.remove() with s.overwrite() on overlapping ranges (throws)
// Rule: hires: true required for correct column mapping in minified output
```

---

## CSS AST (PostCSS)

```typescript
import postcss from 'postcss'

const css = `
  .agent-output {
    color: red;
    font-size: 14px;
    background: var(--color-bg);
  }
`

const root = postcss.parse(css)

// Walk all declarations
root.walkDecls((decl) => {
  // Rename color → color-foreground
  if (decl.prop === 'color') {
    decl.prop = 'color-foreground'
  }
  // Strip hardcoded px values — replace with design token
  if (decl.value.endsWith('px') && !decl.prop.startsWith('--')) {
    const px = parseInt(decl.value)
    decl.value = `var(--spacing-${px})`
  }
})

// Add a new declaration to every rule
root.walkRules((rule) => {
  rule.append({ prop: 'box-sizing', value: 'border-box' })
})

// Remove a specific declaration
root.walkDecls('background', (decl) => {
  if (!decl.value.startsWith('var(')) decl.remove()
})

const output = root.toResult()
console.log(output.css)

// Plugin pattern — reusable transform
const enforceTokens = postcss.plugin('enforce-tokens', () => {
  return (root) => {
    root.walkDecls(/color|background/, (decl) => {
      if (!decl.value.includes('var(--')) {
        decl.warn(root.result!, `Hardcoded color: ${decl.prop}: ${decl.value}`)
      }
    })
  }
})

// Rule: always use root.toResult().css, not root.toString() — includes sourcemap data
// Rule: decl.warn() emits a postcss warning, not a throw — use for linting, not blocking
// Rule: walkDecls(regex) is more specific than walkDecls() + string check inside
```

---

## Anti-Fake-Pass Checklist

```
❌ Regex used for function rename (breaks on multi-line, template literals, comments)
❌ espree parsed without range: true then magic-string used (no byte offsets = wrong)
❌ AST node injected by string concatenation instead of node object (escodegen rejects)
❌ magic-string overwrite() on overlapping ranges (throws InvalidMapping error)
❌ escodegen without sourceMap option when transform needs debugging (no traceability)
❌ PostCSS root.toString() used instead of root.toResult().css (loses map data)
❌ acorn-walk.simple() used when parent chain is needed (use .ancestor() instead)
❌ Walk function missing 'parent' skip — espree backrefs cause infinite recursion
```

---
name: estree-ast-spec
description: ESTree standard AST node types for JavaScript analysis. Node structure reference, custom AST walkers, node type guards, and building AST-based tools from the official ECMAScript AST specification. Sources: estree/estree (MIT).
origin: yana-ai — synthesized from estree/estree (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /estree-ast-spec

## When to Use

- Write AST walkers/visitors without a framework dependency
- Understand node shapes before writing Babel/ESLint plugins
- Build custom parsers, formatters, or analysis tools that consume ESTree output
- Type-guard node types in TypeScript-based AST tooling

## Do NOT use for

- Babel-specific transforms (use [[babel-ast-transform]])
- TypeScript AST (use [[ts-morph-refactor]] — TypeScript extends ESTree)

---

## Core ESTree node types (reference)

```typescript
// ESTree node base
interface Node {
  type: string
  loc?: SourceLocation
}

// Common statement nodes
type Statement =
  | ExpressionStatement   // expr;
  | VariableDeclaration   // const x = 1
  | FunctionDeclaration   // function f() {}
  | ReturnStatement       // return x
  | IfStatement           // if (x) {}
  | BlockStatement        // { ... }
  | ImportDeclaration     // import x from 'y'
  | ExportNamedDeclaration

// Common expression nodes
type Expression =
  | Identifier            // x
  | Literal               // 42, "str", true
  | CallExpression        // f(args)
  | MemberExpression      // obj.prop
  | ArrowFunctionExpression
  | BinaryExpression      // a + b
  | AssignmentExpression  // a = b
  | ObjectExpression      // { k: v }
  | ArrayExpression       // [1, 2]
  | TemplateLiteral       // `${x}`
```

---

## Simple recursive AST walker

```javascript
import { parse } from 'acorn'

function walk(node, visitors) {
  if (!node || typeof node !== 'object') return

  const visitor = visitors[node.type]
  if (visitor) visitor(node)

  for (const key of Object.keys(node)) {
    const child = node[key]
    if (Array.isArray(child)) {
      child.forEach(c => walk(c, visitors))
    } else if (child && typeof child === 'object' && child.type) {
      walk(child, visitors)
    }
  }
}

// Usage: find all function declarations
const ast = parse(source, { ecmaVersion: 2022, sourceType: 'module' })
const fns: string[] = []

walk(ast, {
  FunctionDeclaration(node) {
    fns.push(node.id?.name ?? '<anonymous>')
  },
  ArrowFunctionExpression(node) {
    fns.push('<arrow>')
  },
})

console.log('Functions:', fns)
```

---

## Type guards for safe node access

```typescript
function isIdentifier(node: Node): node is Identifier {
  return node.type === 'Identifier'
}
function isCallExpression(node: Node): node is CallExpression {
  return node.type === 'CallExpression'
}
function isMemberExpression(node: Node): node is MemberExpression {
  return node.type === 'MemberExpression'
}

// Safe extraction: detect `process.env.FOO` pattern
function isProcessEnvAccess(node: Node): boolean {
  if (!isCallExpression(node)) return false
  const { callee } = node
  return (
    isMemberExpression(callee) &&
    isMemberExpression(callee.object) &&
    isIdentifier(callee.object.object) &&
    callee.object.object.name === 'process' &&
    isIdentifier(callee.object.property) &&
    callee.object.property.name === 'env'
  )
}
```

---

## Count cyclomatic complexity via AST

```javascript
function cyclomaticComplexity(fnNode) {
  let complexity = 1  // base path
  walk(fnNode, {
    IfStatement:         () => complexity++,
    ConditionalExpression: () => complexity++,  // ternary
    LogicalExpression(n) { if (n.operator === '&&' || n.operator === '||') complexity++ },
    SwitchCase:          () => complexity++,
    WhileStatement:      () => complexity++,
    ForStatement:        () => complexity++,
    ForInStatement:      () => complexity++,
    ForOfStatement:      () => complexity++,
    CatchClause:         () => complexity++,
  })
  return complexity
}
```

---

## Anti-Fake-Pass Checklist

```
❌ Accessing node.name without checking node.type === 'Identifier' → runtime crash
❌ Walking AST without null guards → loc, id, init can all be null
❌ Confusing ESTree with Babel's @babel/types — Babel adds extra nodes (OptionalCallExpression etc.)
❌ Using acorn without ecmaVersion: 2022 → modern syntax fails to parse
❌ Recursive walker without cycle detection → circular references hang the process
❌ Missing sourceType: 'module' → import/export statements throw SyntaxError
```

---
name: babel-ast-transform
description: Babel plugin architecture for AST-based code transformations. Visitor pattern traversal, path/scope API, custom transform rules, and automated codemod pipelines. Sources: babel/babel (MIT).
origin: yana-ai — synthesized from babel/babel (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /babel-ast-transform

## When to Use

- Write custom Babel plugins to auto-migrate legacy code patterns
- Transform syntax: class properties → ES5, CommonJS → ESM, custom macros
- Codemod pipelines: apply AST rules across an entire monorepo
- Replace manual find-and-replace with safe, scope-aware rewrites

## Do NOT use for

- Runtime code evaluation (use [[repl-code-execution]])
- TypeScript-specific type manipulation (use [[ts-morph-refactor]])

---

## Minimal Babel plugin skeleton

```javascript
// my-babel-plugin.js
export default function myPlugin({ types: t }) {
  return {
    name: 'my-plugin',
    visitor: {
      // Called for every Identifier node in the AST
      Identifier(path) {
        if (path.node.name === 'oldName') {
          path.node.name = 'newName'
        }
      },

      // Called for every CallExpression
      CallExpression(path) {
        const callee = path.get('callee')
        if (callee.isIdentifier({ name: 'deprecatedFn' })) {
          // Replace deprecatedFn(x) → newFn(x)
          callee.node.name = 'newFn'
        }
      },
    },
  }
}
```

---

## Plugin with path manipulation

```javascript
export default function ({ types: t }) {
  return {
    visitor: {
      // Remove console.log() calls entirely
      ExpressionStatement(path) {
        const expr = path.node.expression
        if (
          t.isCallExpression(expr) &&
          t.isMemberExpression(expr.callee) &&
          t.isIdentifier(expr.callee.object, { name: 'console' }) &&
          t.isIdentifier(expr.callee.property, { name: 'log' })
        ) {
          path.remove()
        }
      },

      // Add missing return type annotation to arrow functions
      ArrowFunctionExpression(path) {
        if (!path.node.returnType) {
          path.node.returnType = t.tsTypeAnnotation(t.tsAnyKeyword())
        }
      },
    },
  }
}
```

---

## Programmatic transform (codemod runner)

```javascript
import { transformSync } from '@babel/core'
import { readFileSync, writeFileSync } from 'fs'
import { globSync } from 'glob'

function runCodemod(pattern: string, pluginPath: string) {
  const files = globSync(pattern, { ignore: 'node_modules/**' })

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const result = transformSync(source, {
      filename: file,
      plugins: [pluginPath],
      parserOpts: { plugins: ['typescript', 'jsx'] },
      retainLines: true,      // preserve line numbers for diff readability
      sourceMaps: 'inline',
    })

    if (result?.code && result.code !== source) {
      writeFileSync(file, result.code)
      console.log(`[codemod] transformed ${file}`)
    }
  }
}

runCodemod('src/**/*.{ts,tsx}', './my-babel-plugin.js')
```

---

## Scope-aware rename (respects variable shadowing)

```javascript
export default function ({ types: t }) {
  return {
    visitor: {
      Program(path) {
        // Rename all references to 'oldVar' in this scope only
        path.scope.rename('oldVar', 'newVar')
      },
    },
  }
}
// path.scope.rename handles: declarations, references, shadowed inner scopes
```

---

## Anti-Fake-Pass Checklist

```
❌ Mutating path.node directly without t.cloneNode → shared AST node corruption
❌ path.remove() inside forEach on siblings → skip nodes; use path.getSibling()
❌ Missing parserOpts.plugins: ['typescript'] → ts files fail to parse
❌ Visitor fires on both enter and exit — specify enter/exit explicitly for order-sensitive transforms
❌ scope.rename not called → manual identifier rename misses shadowed bindings
❌ retainLines: false in codemods → diff unreadable across large files
```

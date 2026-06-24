---
name: ast-codegen-patterns
description: Code generation from AST back to source text. esotope-style compact code output, format-preserving reprint, and round-trip AST → source pipelines for codemods and refactoring tools. Sources: glaynge/esotope (BSD-2-Clause).
origin: yana-ai — synthesized from glaynge/esotope (BSD-2-Clause), escodegen (BSD-2-Clause)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /ast-codegen-patterns

## When to Use

- Regenerate source from a modified AST (after [[babel-ast-transform]] or [[estree-ast-spec]] walker)
- Format-preserving reprints: preserve whitespace/comments in unmodified subtrees
- Round-trip pipelines: parse → mutate → generate → diff
- Custom code generation: emit domain-specific patterns from data models

## Do NOT use for

- Full Babel transform pipelines (use [[babel-ast-transform]] which includes generate)
- TypeScript codegen from scratch (use [[ts-morph-refactor]] for type-safe generation)

---

## ESTree → source (escodegen)

```javascript
import escodegen from 'escodegen'
import { parse }  from 'acorn'

const source = `
const arr = [1, 2, 3]
const doubled = arr.map(x => x * 2)
`

const ast = parse(source, { ecmaVersion: 2022, sourceType: 'module' })

// Mutate AST: rename 'doubled' → 'multiplied'
function rename(node, from, to) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'Identifier' && node.name === from) node.name = to
  for (const key of Object.keys(node)) rename(node[key], from, to)
}
rename(ast, 'doubled', 'multiplied')

const output = escodegen.generate(ast, {
  format: {
    indent:    { style: '  ' },
    quotes:    'single',
    semicolons: true,
  },
  comment: true,   // preserve comments from original
})

console.log(output)
// const arr = [1, 2, 3];
// const multiplied = arr.map(x => x * 2);
```

---

## Source map–aware generation

```javascript
import escodegen from 'escodegen'
import { SourceMapConsumer } from 'source-map'

const { code, map } = escodegen.generate(ast, {
  sourceMap:         'input.js',
  sourceMapWithCode: true,
  format: { compact: false },
})

// map is a SourceMapGenerator — serialize for output
const sourceMapString = map.toString()
const codeWithMap = code + '\n//# sourceMappingURL=data:application/json;base64,'
                       + Buffer.from(sourceMapString).toString('base64')
```

---

## Manual AST builder (no parser needed)

```javascript
// Build `export const VERSION = "1.0.0"` from scratch
function buildVersionExport(version: string) {
  return {
    type: 'ExportNamedDeclaration',
    declaration: {
      type: 'VariableDeclaration',
      kind: 'const',
      declarations: [{
        type: 'VariableDeclarator',
        id:   { type: 'Identifier', name: 'VERSION' },
        init: { type: 'Literal',    value: version, raw: JSON.stringify(version) },
      }],
    },
    specifiers: [],
    source: null,
  }
}

const program = {
  type: 'Program',
  body: [buildVersionExport('1.0.0')],
  sourceType: 'module',
}

console.log(escodegen.generate(program))
// export const VERSION = '1.0.0';
```

---

## Round-trip codemod helper

```typescript
import { parse }   from 'acorn'
import escodegen   from 'escodegen'

export function codemod(
  source:  string,
  mutate:  (ast: any) => void,
  options: escodegen.GenerateOptions = {}
): string {
  const ast = parse(source, {
    ecmaVersion: 2022,
    sourceType:  'module',
    onComment:   (block, text, start, end) => {
      // attach comments to nearest node for escodegen to reprint
    },
  })
  mutate(ast)
  return escodegen.generate(ast, {
    comment: true,
    format: { indent: { style: '  ' }, ...options },
  })
}
```

---

## Anti-Fake-Pass Checklist

```
❌ escodegen.generate on Babel AST → Babel adds non-ESTree nodes; strip them first
❌ comment: false → all comments lost in round-trip
❌ Mutating raw node.loc values → code generation uses loc for source maps; corruption
❌ compact: true in a codemod → diffs become unreadable one-liners
❌ Manual AST missing 'raw' field on Literal → some generators produce undefined
❌ sourceMap: 'filename' must match the original filename exactly or stack traces break
```

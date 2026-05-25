---
name: swc-compiler-transform
description: SWC (Speedy Web Compiler) Rust-based JS/TS transforms. Programmatic transpilation, custom plugins via WASM, minification, module format conversion, and performance-sensitive parse pipelines. Sources: swc-project/swc (Apache-2.0).
origin: yamtam-engine — synthesized from swc-project/swc (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /swc-compiler-transform

## When to Use

- Parse/transform large TypeScript codebases where Babel is too slow (10–70× faster)
- CI pipelines: batch transpile thousands of files before analysis
- Module conversion: CJS → ESM, TypeScript → JS, JSX → createElement
- Minification without Terser in build-critical pipelines

## Do NOT use for

- Custom AST visitor plugins in pure JS (use [[babel-ast-transform]])
- When SWC's WASM plugin SDK is overkill — Babel plugins are simpler to write

---

## Basic transform (TS → JS)

```javascript
import { transformSync } from '@swc/core'

const result = transformSync(`
  const greet = (name: string): string => \`Hello, \${name}!\`
  export default greet
`, {
  filename:  'greet.ts',
  sourceMaps: true,
  jsc: {
    parser:  { syntax: 'typescript', tsx: false },
    target:  'es2019',
    transform: {
      legacyDecorator: true,
    },
  },
  module: { type: 'es6' },   // 'commonjs' | 'es6' | 'umd'
})

console.log(result.code)    // transpiled JS
console.log(result.map)     // source map JSON string
```

---

## Async transform (preferred for large files)

```javascript
import { transform } from '@swc/core'
import { readFile, writeFile } from 'fs/promises'
import { globby } from 'globby'

async function batchTransform(pattern: string, outDir: string) {
  const files = await globby(pattern)

  await Promise.all(files.map(async (file) => {
    const source = await readFile(file, 'utf8')
    const { code, map } = await transform(source, {
      filename: file,
      sourceMaps: true,
      jsc: {
        parser: { syntax: 'typescript', tsx: file.endsWith('.tsx') },
        target: 'es2020',
      },
      module: { type: 'commonjs' },
    })

    const outFile = file.replace('src/', outDir + '/').replace(/\.tsx?$/, '.js')
    await writeFile(outFile, code)
    if (map) await writeFile(outFile + '.map', map)
  }))
}
```

---

## Minify (production build)

```javascript
import { minify } from '@swc/core'

const { code } = await minify(sourceCode, {
  compress: {
    unused:          true,
    dead_code:       true,
    drop_console:    true,
    passes:          2,
  },
  mangle:  { toplevel: false },
  format:  { comments: false },
  sourceMap: false,
})
```

---

## Parse only (AST extraction)

```javascript
import { parse } from '@swc/core'

const ast = await parse(`
  export function add(a: number, b: number) { return a + b }
`, {
  syntax:    'typescript',
  comments:  false,
  script:    false,
})

// ast is SWC's own AST (not ESTree — use estree-compat layer if needed)
const firstExport = ast.body[0]
// firstExport.type === 'ExportDeclaration'
```

---

## Anti-Fake-Pass Checklist

```
❌ Using transformSync in async Node server → blocks event loop on large files
❌ jsc.target: 'es5' without specifying externalHelpers: true → bloated output (helpers inlined per file)
❌ SWC AST !== ESTree — don't pass SWC ast to ESLint/Babel APIs directly
❌ sourceMaps: true without writing .map file → source maps referenced but missing
❌ tsx: false for .tsx files → JSX syntax errors
❌ SWC WASM plugins require @swc/wasm-typescript — not bundled by default
```

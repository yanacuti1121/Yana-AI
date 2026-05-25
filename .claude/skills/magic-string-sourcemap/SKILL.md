---
name: magic-string-sourcemap
description: Source string mutation with automatic source map tracking. In-place overwrite, insertion, removal, and prepend/append operations that preserve accurate sourcemap positions for patch loops and codemods. Sources: unjs/magic-string (MIT).
origin: yamtam-engine — synthesized from unjs/magic-string (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /magic-string-sourcemap

## When to Use

- Patch source code in a codemod/transform pipeline while keeping source maps valid
- Inject imports, decorators, or license headers at the top of a file
- Remove dead code blocks from a string without re-parsing the AST
- Bundle multiple source files into one string with accurate per-file source maps

## Do NOT use for

- Heavy AST restructuring (use [[babel-ast-transform]] or [[ts-morph-refactor]])
- Non-source string manipulation (use regular string methods)

---

## Basic mutations

```javascript
import MagicString from 'magic-string'

const s = new MagicString(`export const VERSION = 'dev'`)

// Overwrite a range: positions are character offsets in the original string
s.overwrite(23, 28, '1.0.0')  // 'dev' → '1.0.0'

// Insert before/after a position
s.prependLeft(0, '// Auto-generated\n')
s.appendRight(s.length(), '\n\nexport default VERSION')

// Remove a range (e.g., strip a debug block)
s.remove(30, 45)

console.log(s.toString())
// // Auto-generated
// export const VERSION = '1.0.0'
// export default VERSION
```

---

## Generate source map

```javascript
import MagicString from 'magic-string'

const s = new MagicString(sourceCode, {
  filename:          'src/config.ts',  // for source map 'sources' entry
  indentExclusionRanges: [],
})

// ... mutations ...

const map = s.generateMap({
  source:      'src/config.ts',
  file:        'dist/config.js',
  includeContent: true,     // embed original source in map
  hires:       true,        // character-level accuracy (not just line-level)
})

// Write output
writeFileSync('dist/config.js',     s.toString())
writeFileSync('dist/config.js.map', map.toString())
```

---

## Bundle multiple files with combined source map

```javascript
import MagicString, { Bundle } from 'magic-string'

const bundle = new Bundle()

for (const { filename, source } of files) {
  const s = new MagicString(source, { filename })
  // optional per-file mutations
  s.prepend(`// --- ${filename} ---\n`)
  bundle.addSource({ filename, content: s })
}

const output = bundle.toString()
const map    = bundle.generateMap({ includeContent: true, hires: true })

writeFileSync('bundle.js',     output)
writeFileSync('bundle.js.map', map.toString())
```

---

## Inject import at top of file

```javascript
function injectImport(source: string, importStatement: string): string {
  const s = new MagicString(source)

  // Find first non-comment line to insert after
  const firstNonComment = source.search(/^[^/\n]/)
  const insertAt = firstNonComment > 0 ? firstNonComment : 0

  s.prependLeft(insertAt, importStatement + '\n')
  return s.toString()
}

const patched = injectImport(
  readFileSync('src/app.ts', 'utf8'),
  "import { logger } from './logger'"
)
```

---

## Anti-Fake-Pass Checklist

```
❌ Overlapping overwrite ranges → MagicString throws; check ranges don't overlap before patching
❌ hires: false → line-level source maps only; column positions in debugger are wrong
❌ s.remove then s.overwrite same range → invalid state; use one operation per range
❌ Not writing .map file → source maps referenced in JS but 404 in browser devtools
❌ MagicString positions are UTF-16 code units — be careful with multi-byte Unicode
❌ bundle.addSource without filename → all sources merged under undefined in source map
```

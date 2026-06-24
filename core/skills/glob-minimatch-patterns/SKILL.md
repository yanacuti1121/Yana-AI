---
name: glob-minimatch-patterns
description: Glob pattern matching and file filtering using minimatch. Convert glob patterns to optimized regex, batch file filtering, negation patterns, brace expansion, and ReDoS-safe usage. Sources: isaacs/minimatch.
origin: yana-ai — synthesized from isaacs/minimatch (ISC License)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /glob-minimatch-patterns

## When to Use

- Filter skill/rule/script file lists by glob pattern (core/**/*.sh)
- Implement `.gitignore`-style file exclusion in agent tools
- Build allowlists/denylists for which files agents can read or write
- Validate file paths before passing to sandboxed commands

## Do NOT use for

- Directory traversal — use [[filesystem-isolation-chroot]] for path containment
- User-supplied regex patterns (use [[regex-escape-redos-guard]] first)

---

## Basic matching

```javascript
import { minimatch } from 'minimatch'

// Single match
minimatch('core/scripts/tool-proxy.sh', 'core/**/*.sh')  // true
minimatch('core/rules/foo.md', 'core/**/*.sh')            // false

// Options
minimatch('README.MD', '**/*.md', { nocase: true })       // true
minimatch('.hidden',   '**',      { dot: true })          // true (dot:true matches dotfiles)
```

---

## Batch file filtering

```javascript
import { minimatch }   from 'minimatch'
import { readdirSync } from 'fs'
import { join }        from 'path'

function filterFiles(
  dir:      string,
  patterns: string[],
  negations: string[] = []
): string[] {
  const allFiles = readdirSync(dir, { recursive: true, withFileTypes: false }) as string[]

  return allFiles.filter(f => {
    const rel = f.replace(/\\/g, '/')  // normalize Windows paths
    const included = patterns.some(p  => minimatch(rel, p, { dot: false }))
    const excluded = negations.some(p => minimatch(rel, p, { dot: false }))
    return included && !excluded
  })
}

// Example: all skill files, excluding drafts
const skills = filterFiles(
  '/workspaces/yana-ai/core/skills',
  ['*/SKILL.md'],
  ['**/draft-*', '**/*.bak']
)
```

---

## Build file access allowlist for sandbox

```javascript
const READABLE_PATTERNS = [
  'core/skills/**/*.md',
  'core/rules/**/*.md',
  'README.md',
  'MANIFEST.json',
]

const WRITABLE_PATTERNS = [
  'releases/**',
  'core/memory/**',
]

function checkAccess(path: string, mode: 'read' | 'write'): boolean {
  const patterns = mode === 'read' ? READABLE_PATTERNS : WRITABLE_PATTERNS
  return patterns.some(p => minimatch(path, p, { matchBase: false }))
}
```

---

## Brace expansion

```javascript
import { minimatch, braceExpand } from 'minimatch'

// Expand patterns before matching
const patterns = braceExpand('core/{skills,rules,scripts}/**/*.{md,sh}')
// → ['core/skills/**/*.md', 'core/skills/**/*.sh', 'core/rules/**/*.md', ...]
```

---

## Anti-Fake-Pass Checklist

```
❌ matchBase:true — 'foo.sh' matches 'deeply/nested/foo.sh' unexpectedly
❌ dot:false (default) — patterns miss dotfiles (.claude/, .gitignore)
❌ Path not normalized (\\→/) on Windows — all matches fail
❌ User-supplied glob not validated — **/../../../etc/passwd traversal
❌ Glob on absolute paths — minimatch expects relative paths from a root
❌ No negation — cannot express "all .md except drafts" without both arrays
```

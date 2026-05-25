---
name: gitignore-pattern-matching
description: .gitignore-compatible pattern matching for agent file access control. Ignore rule parsing, negative patterns, per-directory scope, and building file access gates from gitignore-style rules. Sources: kaelzhang/node-ignore.
origin: yamtam-engine — synthesized from kaelzhang/node-ignore (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /gitignore-pattern-matching

## When to Use

- Agent needs to skip files matching `.gitignore` patterns (avoid reading secrets/node_modules)
- Building an access-control gate: which files an agent is allowed to read
- Parsing `.claudeignore` or custom ignore files for sandbox boundaries
- Filtering output of file listings before passing to LLM context

## Do NOT use for

- Security-critical access control alone (filesystem permissions are ground truth)
- Glob matching without gitignore semantics (use [[glob-minimatch-patterns]])

---

## Basic ignore check

```javascript
import ignore from 'ignore'
import { readFileSync, readdirSync } from 'fs'

// Load .gitignore rules
const ig = ignore()
ig.add(readFileSync('/workspaces/yamtam-engine/.gitignore', 'utf8'))

// Add custom agent rules
ig.add([
  'releases/logs/',
  '*.env',
  '**/.env*',
  'node_modules/',
  '**/__pycache__/',
])

// Check single path (must be relative, no leading /)
ig.ignores('releases/logs/tool-proxy.log')  // true
ig.ignores('core/rules/foo.md')             // false
```

---

## Filter file list

```javascript
function listAgentReadableFiles(projectRoot: string): string[] {
  const ig = ignore()

  // Load repo .gitignore
  try {
    ig.add(readFileSync(`${projectRoot}/.gitignore`, 'utf8'))
  } catch { /* no .gitignore */ }

  // Agent-specific extra ignores
  ig.add(['*.secret','**/*.key','**/*.pem','*.env*','.claude/settings*'])

  const allFiles = getAllFiles(projectRoot)  // recursive fs walk
  const relative = allFiles.map(f => f.replace(projectRoot + '/', ''))

  return ig.filter(relative)
}
```

---

## Parse custom .claudeignore

```javascript
import { existsSync, readFileSync } from 'fs'

function loadClaudeIgnore(root: string): ReturnType<typeof ignore> {
  const ig = ignore()
  const claudeignorePath = `${root}/.claudeignore`

  if (existsSync(claudeignorePath)) {
    ig.add(readFileSync(claudeignorePath, 'utf8'))
  }

  // Always block secrets regardless
  ig.add(['**/*.env','**/*.key','**/*.pem','**/*.p12','**/*.pfx','**/.aws/'])
  return ig
}
```

---

## Bash equivalent

```bash
# Use git ls-files to list only tracked + unignored files
git -C /workspaces/yamtam-engine ls-files --cached --others --exclude-standard \
  | grep -v '^releases/logs/'

# Check if a specific file would be ignored
git check-ignore -v releases/logs/session.log
```

---

## Anti-Fake-Pass Checklist

```
❌ Absolute paths passed to ig.ignores() → always returns false (must be relative)
❌ Leading slash in pattern → matches root only, not subdirectories
❌ Trailing slash on file rule → only matches directories, not files
❌ .gitignore negation (!pattern) not loaded in order → later negations override
❌ node_modules/ not ignored → agent reads 50k+ files, floods LLM context
❌ .env files not explicitly blocked → secrets leak into agent context
```

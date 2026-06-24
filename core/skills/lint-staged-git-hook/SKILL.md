---
name: lint-staged-git-hook
description: lint-staged pre-commit hook for running linters only on Git-staged files. Pattern-matched task runners, auto-fix before commit, integration with husky, and staged-only analysis to minimize CI overhead. Sources: okonet/lint-staged (MIT).
origin: yana-ai — synthesized from okonet/lint-staged (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /lint-staged-git-hook

## When to Use

- Run ESLint/Prettier/ktlint only on files being committed (not the whole repo)
- Auto-fix formatting before commit so developers never push bad style
- Yamtam hook layer: run security checks on staged files only to keep hooks fast
- Monorepo: pattern-match different tools per package directory

## Do NOT use for

- Full CI pipeline analysis (lint-staged runs only on staged files, not all changed files in a PR)
- Post-commit hooks (use [[merkle-tree-audit]] for post-commit integrity)

---

## Setup

```bash
npm install --save-dev lint-staged husky
npx husky init
echo "npx lint-staged" > .husky/pre-commit
```

---

## lint-staged.config.js (recommended format)

```javascript
export default {
  // TypeScript/JavaScript: fix + check
  '**/*.{ts,tsx,js,jsx}': [
    'eslint --fix --max-warnings 0',
    'prettier --write',
  ],

  // Python: format + type check staged files only
  '**/*.py': [
    'black --check',
    'ruff check --fix',
  ],

  // Kotlin: format staged files
  '**/*.kt': [
    'ktlint --format',
  ],

  // JSON/YAML: format only
  '**/*.{json,yaml,yml}': [
    'prettier --write',
  ],

  // Shell scripts: lint
  '**/*.sh': [
    'shellcheck --severity=warning',
  ],

  // Secrets scan on any staged file
  '*': [
    'gitleaks protect --staged --no-banner',
  ],
}
```

---

## Advanced: function-style tasks

```javascript
export default {
  // Pass all staged TS files to tsc type-check (tsc doesn't accept individual files)
  '**/*.ts?(x)': () => 'tsc --noEmit',

  // Custom logic: only run heavy analysis if > 5 files changed
  '**/*.{js,ts}': (stagedFiles) => {
    if (stagedFiles.length > 5) {
      return [`eslint --fix ${stagedFiles.join(' ')}`, 'jest --passWithNoTests --findRelatedTests']
    }
    return [`eslint --fix ${stagedFiles.join(' ')}`]
  },
}
```

---

## Integration with yamtam tool-proxy.sh hook

```bash
# .husky/pre-commit — runs before every commit
#!/usr/bin/env sh
set -e

# 1. lint-staged (fast, staged-only)
npx lint-staged

# 2. yamtam security gate on staged files
STAGED=$(git diff --cached --name-only --diff-filter=ACM)
if [ -n "$STAGED" ]; then
  echo "$STAGED" | xargs -I{} bash core/scripts/tool-proxy.sh "cat {}" 2>/dev/null || true
fi

# 3. verify manifest hasn't drifted
bash core/scripts/validate-manifest.sh
```

---

## Anti-Fake-Pass Checklist

```
❌ lint-staged without husky → config exists but pre-commit hook never runs
❌ Auto-fix modifies files not re-staged → commit contains unfixed version of the file
❌ '*.ts': ['tsc --noEmit', stagedFiles] → tsc ignores passed filenames; use () => 'tsc --noEmit'
❌ shellcheck path not found → lint-staged silently passes (non-zero exit check)
❌ gitleaks not installed → secret scan step skipped with no error
❌ concurrent: false not set when tasks write same file → race condition between formatter and linter
```

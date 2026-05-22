# YAMTAM ENGINE — Agent Code Constraints
# Source: peterhallen/Coding-Standards hard metrics

**Status:** Active  
**Enforced by:** All code-writing agents, /write-tests, /tdd-cycle  
**Companion skills:** `coding-standards`, `refactor-patterns`, `react-doctor`

---

## Hard Metric Limits

These numbers are HARD LIMITS — agents must not generate code that violates them.
If code would exceed a limit, refactor/split BEFORE delivering.

| Metric | Hard limit | Preferred |
|---|---|---|
| Function length | 50 lines | ≤ 30 lines |
| Function parameters | 5 | ≤ 3 |
| Nesting depth | 3 levels | ≤ 2 levels |
| File length | 300 lines | ≤ 200 lines |
| Cyclomatic complexity | 10 | ≤ 5 |
| Class methods | 10 | ≤ 7 |
| Import count per file | 15 | ≤ 10 |
| Callback nesting | 2 levels | 0 (use async/await) |

---

## Nesting Depth Example

```ts
// ❌ REJECT — 4 levels of nesting
function processOrder(order) {
  if (order) {                              // level 1
    if (order.items.length > 0) {           // level 2
      order.items.forEach(item => {         // level 3
        if (item.inStock) {                 // level 4 ← REJECTED
          fulfillItem(item);
        }
      });
    }
  }
}

// ✅ Early return + extract
function processOrder(order) {
  if (!order || order.items.length === 0) return;
  const stockedItems = order.items.filter(i => i.inStock);
  stockedItems.forEach(fulfillItem);
}
```

---

## Parameter Count

```ts
// ❌ REJECT — 6 parameters
function createUser(name, email, role, orgId, sendWelcome, expiresAt) { }

// ✅ Use options object when > 3 params
interface CreateUserOptions {
  name:         string;
  email:        string;
  role:         UserRole;
  orgId:        string;
  sendWelcome?: boolean;
  expiresAt?:   Date;
}
function createUser(options: CreateUserOptions) { }
```

---

## File Length

```
Hard limit: 300 lines per file
  > 300 lines → split into multiple files before delivering

Split strategies:
  Component file:  extract sub-components, hooks, utils to separate files
  Service file:    split by domain (user.service.ts, user.queries.ts, user.types.ts)
  Skill file:      split into SKILL.md + referenced gate file if > 220 lines
```

---

## Complexity Gate — ESLint / Lint Rules

```json
// .eslintrc or eslint.config.js
{
  "rules": {
    "complexity":                     ["error", { "max": 10 }],
    "max-depth":                      ["error", { "max": 3 }],
    "max-params":                     ["error", { "max": 5 }],
    "max-lines-per-function":         ["warn",  { "max": 50 }],
    "max-lines":                      ["warn",  { "max": 300 }],
    "max-nested-callbacks":           ["error", { "max": 2 }],
    "no-else-return":                 "error"
  }
}
```

```toml
# Python — flake8 / ruff limits
[tool.ruff.lint]
max-complexity = 10

[tool.pylint.design]
max-args = 5
max-bool-expr = 5
max-branches = 10
max-returns = 6
max-statements = 50
```

---

## Agent Enforcement

When `/write-tests`, `/tdd-cycle`, or any code agent generates code:

```
□ No function exceeds 50 lines (count blank lines, exclude docstrings)
□ No function has > 5 parameters (options object if needed)
□ Nesting depth ≤ 3 levels (use early return to flatten)
□ No file exceeds 300 lines (split if needed)
□ Cyclomatic complexity ≤ 10 (ESLint complexity rule passes)
□ No callback nesting > 2 levels (use async/await)
```

**Enforcement command:**
```bash
# Quick check before committing
npx eslint --rule 'complexity: ["error",10]' --rule 'max-depth: ["error",3]' src/
# or
ruff check --select C901 src/
```

---

## Exceptions (must be documented inline)

Some valid exceptions — agent must comment why:

```ts
// COMPLEXITY-EXCEPTION: parser state machine requires high branching — cannot split further
function parseTokens(tokens: Token[]): ASTNode { ... }
```

Exceptions require: a comment, a reason, and must not exceed 2× the limit.

---
name: eslint-rule-engine
description: ESLint custom rule architecture. AST visitor rules with auto-fix, rule metadata, nested rule hierarchies, RuleTester harness, and monorepo-wide static analysis configuration. Sources: eslint/eslint (MIT).
origin: yana-ai — synthesized from eslint/eslint (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /eslint-rule-engine

## When to Use

- Write custom ESLint rules for project-specific code patterns
- Add auto-fix capability to enforce naming conventions, remove deprecated APIs
- Extend ESLint for yamtam security rules (e.g., block `eval`, unsafe assignments)
- RuleTester: unit-test rules with valid/invalid fixtures without running the full linter

## Do NOT use for

- General AST traversal outside ESLint context (use [[estree-ast-spec]])
- Python/Kotlin code analysis (use [[pyre-type-analysis]] / [[ktlint-auto-format]])

---

## Custom rule: disallow specific function call

```javascript
// rules/no-unsafe-eval.js
/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type:    'problem',
    docs:    { description: 'Disallow eval() and Function() constructor' },
    schema:  [],
    messages: {
      noEval: 'eval() is forbidden — use vm.Script with sandboxing instead.',
      noFunctionCtor: 'new Function() is forbidden — same risk as eval().',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'eval') {
          context.report({ node, messageId: 'noEval' })
        }
      },
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Function') {
          context.report({ node, messageId: 'noFunctionCtor' })
        }
      },
    }
  },
}
```

---

## Rule with auto-fix

```javascript
// rules/prefer-const-assert.js — replace `let x = val` when x never reassigned
module.exports = {
  meta: {
    type:    'suggestion',
    fixable: 'code',   // required to enable fixes
    messages: { preferConst: 'Use const — this variable is never reassigned.' },
    schema:  [],
  },
  create(context) {
    return {
      VariableDeclaration(node) {
        if (node.kind !== 'let') return
        const [decl] = node.declarations
        const scope  = context.getScope()
        const variable = scope.variables.find(v => v.name === decl.id?.name)

        const isNeverReassigned = variable?.references
          .every(ref => ref.isWriteReference() ? ref.writeExpr === decl.init : true)

        if (isNeverReassigned) {
          context.report({
            node,
            messageId: 'preferConst',
            fix(fixer) {
              return fixer.replaceText(
                context.getSourceCode().getFirstToken(node)!,
                'const'
              )
            },
          })
        }
      },
    }
  },
}
```

---

## RuleTester (unit test harness)

```javascript
import { RuleTester } from 'eslint'
import rule           from './rules/no-unsafe-eval.js'

const tester = new RuleTester({ parserOptions: { ecmaVersion: 2022 } })

tester.run('no-unsafe-eval', rule, {
  valid: [
    { code: 'const x = 1 + 2' },
    { code: 'vm.runInContext(code, sandbox)' },
  ],
  invalid: [
    { code: 'eval("alert(1)")',   errors: [{ messageId: 'noEval' }] },
    { code: 'new Function("x")', errors: [{ messageId: 'noFunctionCtor' }] },
  ],
})
console.log('[eslint-rule] tests passed')
```

---

## Flat config registration (eslint.config.js)

```javascript
import noUnsafeEval from './rules/no-unsafe-eval.js'

export default [
  {
    plugins: { yamtam: { rules: { 'no-unsafe-eval': noUnsafeEval } } },
    rules:   { 'yamtam/no-unsafe-eval': 'error' },
    files:   ['src/**/*.{js,ts,tsx}'],
    ignores: ['node_modules', 'dist'],
  },
]
```

---

## Anti-Fake-Pass Checklist

```
❌ meta.fixable not set → fix() callback silently ignored
❌ context.report without messageId or message → ESLint throws at rule load
❌ Visitor returns undefined for unmatched nodes — that's fine; don't throw
❌ RuleTester not run in CI → rules ship broken without harness
❌ schema: [] missing → ESLint rejects rule options at config parse time
❌ context.getScope() inside arrow functions captures wrong scope — use context.getScope() at declaration site
```

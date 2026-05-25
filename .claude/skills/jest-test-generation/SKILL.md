---
name: jest-test-generation
description: Automated Jest test case generation from AST and type signatures. Bazel rules_jest integration, property-based test scaffolding, snapshot generation, and coverage-driven test augmentation. Sources: aspect-build/rules_jest (Apache-2.0).
origin: yamtam-engine — synthesized from aspect-build/rules_jest (Apache-2.0), jest (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /jest-test-generation

## When to Use

- Auto-generate test stubs for new functions when [[ts-morph-refactor]] adds them
- Bazel monorepo: hermetic Jest tests with rules_jest BUILD targets
- Property-based testing: generate input/output pairs from type signatures
- Coverage gap analysis: find untested branches and emit test scaffolds

---

## Generate test stubs from ts-morph AST

```typescript
import { Project } from 'ts-morph'
import { writeFileSync } from 'fs'

function generateTestStubs(srcPath: string): string {
  const project = new Project({ tsConfigFilePath: 'tsconfig.json' })
  const sf      = project.addSourceFileAtPath(srcPath)
  const fns     = sf.getExportedDeclarations()

  const lines: string[] = [
    `import { ${[...fns.keys()].join(', ')} } from '${srcPath.replace(/\.ts$/, '')}'`,
    '',
    `describe('${srcPath}', () => {`,
  ]

  for (const [name, [decl]] of fns) {
    if (decl.getKindName() !== 'FunctionDeclaration') continue
    lines.push(`  describe('${name}', () => {`)
    lines.push(`    it('should return expected value for valid input', () => {`)
    lines.push(`      // TODO: arrange`)
    lines.push(`      // const result = ${name}(...)`)
    lines.push(`      // expect(result).toMatchSnapshot()`)
    lines.push(`    })`)
    lines.push(`    it('should throw on invalid input', () => {`)
    lines.push(`      expect(() => ${name}(undefined as any)).toThrow()`)
    lines.push(`    })`)
    lines.push(`  })`)
  }

  lines.push('})')
  return lines.join('\n')
}

const stubs = generateTestStubs('src/utils.ts')
writeFileSync('src/__tests__/utils.test.ts', stubs)
```

---

## Bazel rules_jest (BUILD.bazel)

```python
load("@aspect_rules_jest//jest:defs.bzl", "jest_test")

jest_test(
    name       = "utils_test",
    srcs       = glob(["src/__tests__/**/*.test.ts"]),
    data       = [":src"],
    config     = "//:jest.config.js",
    snapshots  = glob(["src/__tests__/__snapshots__/**"]),
    tags       = ["jest"],
)
```

---

## jest.config.js for Bazel + ts-jest

```javascript
export default {
  preset:              'ts-jest',
  testEnvironment:     'node',
  roots:               ['<rootDir>/src'],
  testMatch:           ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80 },
  },
  globals: {
    'ts-jest': {
      tsconfig:    'tsconfig.json',
      diagnostics: false,  // skip type errors in test files
    },
  },
}
```

---

## Property-based test scaffold (fast-check)

```typescript
import fc from 'fast-check'
import { add } from '../math'

describe('add — property tests', () => {
  it('is commutative', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), (a, b) => {
      expect(add(a, b)).toBe(add(b, a))
    }))
  })

  it('identity: add(x, 0) === x', () => {
    fc.assert(fc.property(fc.integer(), (x) => {
      expect(add(x, 0)).toBe(x)
    }))
  })
})
```

---

## Coverage gap reporter (find untested functions)

```bash
#!/usr/bin/env bash
# find-coverage-gaps.sh — emit test stubs for uncovered functions
npx jest --coverage --json --outputFile=coverage/report.json 2>/dev/null

node - <<'EOF'
const report = JSON.parse(require('fs').readFileSync('coverage/report.json', 'utf8'))
for (const [file, cov] of Object.entries(report.coverageMap)) {
  const uncovered = Object.entries(cov.fnMap)
    .filter(([id]) => cov.s[id] === 0)
    .map(([, fn]) => fn.name)
  if (uncovered.length) console.log(`[gaps] ${file}: ${uncovered.join(', ')}`)
}
EOF
```

---

## Anti-Fake-Pass Checklist

```
❌ Generated test stubs committed without actual assertions → coverage appears high, tests prove nothing
❌ snapshots not in Bazel data → Bazel sandbox can't find snapshot files at test runtime
❌ diagnostics: false in ts-jest → type errors in tests silently pass
❌ coverageThreshold too low (< 60%) → CI passes with trivially low coverage
❌ Property-based tests without seed logging → flaky failures non-reproducible
❌ jest --findRelatedTests with generated files → generator re-runs on every related test
```

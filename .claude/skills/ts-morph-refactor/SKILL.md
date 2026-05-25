---
name: ts-morph-refactor
description: TypeScript Compiler API via ts-morph for structural code manipulation. Navigate class/interface/function AST nodes, add/remove/rename declarations, batch refactor across a project, and type-safe code generation. Sources: dsherret/ts-morph (MIT).
origin: yamtam-engine — synthesized from dsherret/ts-morph (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /ts-morph-refactor

## When to Use

- Structurally refactor TypeScript code: rename interfaces, add method signatures, inject decorators
- Enforce architectural rules: every exported function must have a JSDoc tag
- Code generation: generate typed client SDKs from API schemas
- Safe batch rename across a full TypeScript project (respects type references)

## Do NOT use for

- Runtime JS manipulation (use [[magic-string-sourcemap]] for source patching)
- Non-TypeScript codebases (use [[babel-ast-transform]] for plain JS)

---

## Project setup

```typescript
import { Project, SyntaxKind } from 'ts-morph'

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
  // or manually:
  compilerOptions: { strict: true, target: 2 /* ES2015 */ },
})

// Add all source files
project.addSourceFilesAtPaths('src/**/*.ts')
```

---

## Navigate and inspect

```typescript
// Find all exported async functions missing return type
const sourceFiles = project.getSourceFiles()

for (const sf of sourceFiles) {
  for (const fn of sf.getFunctions()) {
    if (fn.isExported() && fn.isAsync() && !fn.getReturnTypeNode()) {
      console.warn(
        `[ts-morph] Missing return type: ${fn.getName()} in ${sf.getFilePath()}`
      )
    }
  }
}
```

---

## Add interface method signature

```typescript
const sf    = project.getSourceFileOrThrow('src/IAgent.ts')
const iface = sf.getInterfaceOrThrow('IAgent')

// Add a new required method
iface.addMethod({
  name:       'shutdown',
  returnType: 'Promise<void>',
  docs:       [{ description: 'Gracefully stop the agent.' }],
})

// Save changes back to disk
await sf.save()
```

---

## Rename symbol across entire project

```typescript
// Rename interface IAgent → IAgentV2 in all files
const sf    = project.getSourceFileOrThrow('src/IAgent.ts')
const iface = sf.getInterfaceOrThrow('IAgent')

// rename() updates all references across the project
iface.rename('IAgentV2')

await project.save()
console.log('[ts-morph] Renamed IAgent → IAgentV2 across all files')
```

---

## Generate TypeScript file from schema

```typescript
function generateTypedClient(
  methods: { name: string; params: string; returnType: string }[]
): void {
  const sf = project.createSourceFile('src/generated/client.ts', '', {
    overwrite: true,
  })

  const cls = sf.addClass({
    name:     'GeneratedClient',
    isExported: true,
  })

  for (const m of methods) {
    cls.addMethod({
      name:       m.name,
      isAsync:    true,
      parameters: [{ name: 'params', type: m.params }],
      returnType: `Promise<${m.returnType}>`,
      statements: `return this.call('${m.name}', params)`,
    })
  }

  sf.saveSync()
}
```

---

## Anti-Fake-Pass Checklist

```
❌ project.save() not called → mutations in memory only, files unchanged on disk
❌ getSourceFileOrThrow on non-existent file → throws; use getSourceFile + null check
❌ rename() without saving entire project → partial renames leave inconsistent references
❌ addSourceFilesAtPaths after manipulation → re-adding files resets unsaved changes
❌ compilerOptions mismatch with tsconfig → type-checker uses different rules than editor
❌ Large projects without skipAddingFilesFromTsConfig: true → loads all node_modules types, extremely slow
```

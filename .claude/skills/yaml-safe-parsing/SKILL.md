---
name: yaml-safe-parsing
description: Safe YAML parsing resistant to YAML bombs and prototype pollution. eemeli/yaml safe schema, document size limits, no-execute mode, type-safe output, and config file validation patterns. Sources: eemeli/yaml.
origin: yamtam-engine — synthesized from eemeli/yaml (ISC License)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /yaml-safe-parsing

## When to Use

- Parsing any YAML config file in agent pipelines (hooks, rules, skills)
- Preventing YAML bomb DoS (billion laughs) from untrusted config inputs
- Loading structured config with type validation before use
- Replacing `js-yaml.safeLoad` (deprecated) with modern safe parser

## Do NOT use for

- YAML serialization of arbitrary objects with class instances
- Streaming multi-document YAML files > 10MB

---

## Safe parse with size limit

```javascript
import { parse, parseDocument } from 'yaml'
import { readFileSync }         from 'fs'

const MAX_CONFIG_SIZE = 512 * 1024  // 512KB hard limit

function loadConfig(filePath: string): unknown {
  const raw = readFileSync(filePath, 'utf8')

  if (raw.length > MAX_CONFIG_SIZE) {
    throw new Error(`[yaml] config file too large: ${raw.length} bytes (max ${MAX_CONFIG_SIZE})`)
  }

  // parse() with failOnWarning — reject ambiguous YAML
  return parse(raw, {
    schema:         'core',          // strict: no !!js/undefined etc.
    maxAliasCount:  10,              // YAML bomb: limit alias expansion
    strict:         false,           // don't throw on duplicate keys (log instead)
    logLevel:       'warn',
    prettyErrors:   true,
  })
}
```

---

## YAML bomb prevention

```javascript
// Test: anchor-alias explosion (billion laughs pattern)
// a: &a [...]
// b: [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]
// c: [*b, *b, *b, ...]

// eemeli/yaml default maxAliasCount = 100
// Set to 10 for paranoid mode:
parse(input, { maxAliasCount: 10 })
// Throws: Excessive alias count

// Also set an overall timeout for paranoid inputs:
async function safeParseWithTimeout(input: string, ms = 500): Promise<unknown> {
  return Promise.race([
    Promise.resolve(parse(input, { maxAliasCount: 10 })),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('[yaml] parse timeout')), ms)
    ),
  ])
}
```

---

## Type-safe config loader

```typescript
import { parse } from 'yaml'
import { z }     from 'zod'

const AgentConfigSchema = z.object({
  version:  z.string(),
  rules:    z.array(z.string()),
  timeout:  z.number().int().positive().max(300),
  sandbox:  z.object({
    enabled: z.boolean(),
    memory:  z.string().regex(/^\d+[mg]$/i),
  }).optional(),
})

type AgentConfig = z.infer<typeof AgentConfigSchema>

function loadAgentConfig(path: string): AgentConfig {
  const raw    = readFileSync(path, 'utf8')
  const parsed = parse(raw, { maxAliasCount: 10 })
  return AgentConfigSchema.parse(parsed)  // throws ZodError if invalid
}
```

---

## Detect prototype pollution in YAML output

```javascript
// Dangerous keys to reject
const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function assertNoProtoKeys(obj: unknown, path = ''): void {
  if (typeof obj !== 'object' || obj === null) return
  for (const key of Object.keys(obj as object)) {
    if (PROTO_KEYS.has(key)) {
      throw new Error(`[yaml] prototype pollution key at ${path}.${key}`)
    }
    assertNoProtoKeys((obj as Record<string, unknown>)[key], `${path}.${key}`)
  }
}
```

---

## Anti-Fake-Pass Checklist

```
❌ js-yaml.load() (not safeLoad) → executes !!js/function tags — RCE
❌ No maxAliasCount → YAML bomb exponential alias expansion → OOM
❌ No file size limit → 100MB YAML config accepted, parser hangs
❌ schema:'json' too permissive — use 'core' for strict type safety
❌ No Zod/schema validation after parse → type: any propagates to business logic
❌ __proto__ key in YAML → prototype pollution if result spread into objects
```

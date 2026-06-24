---
name: toml-config-parsing
description: TOML configuration file parsing for Rust/Cargo-style configs. Type-preserving parse, nested table access, array of tables, inline tables, and validation patterns. Sources: iarna/iarna-toml (toml@latest).
origin: yana-ai — synthesized from iarna/iarna-toml (ISC License), TOML v1.0 spec
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /toml-config-parsing

## When to Use

- Reading Rust Cargo.toml or Python pyproject.toml in agent pipelines
- Parsing yana-ai config files written in TOML format
- Type-safe config loading where TOML's strict typing prevents ambiguity
- Replacing JSON configs where comments are needed (TOML supports # comments)

## Do NOT use for

- YAML configs already in place (don't convert without reason)
- Streaming huge TOML files (load fully into memory)

---

## Basic parse

```javascript
import TOML from '@iarna/toml'
import { readFileSync } from 'fs'

function loadToml(path: string): TOML.JsonMap {
  const raw = readFileSync(path, 'utf8')
  return TOML.parse(raw)  // throws on syntax error
}

// Example Cargo.toml
const cargo = loadToml('/workspaces/project/Cargo.toml')
console.log(cargo.package?.name)       // string
console.log(cargo.dependencies)        // object
```

---

## Type-safe loader with validation

```typescript
import TOML from '@iarna/toml'
import { z } from 'zod'

const YamtamTomlSchema = z.object({
  engine: z.object({
    version:         z.string(),
    sandbox_enabled: z.boolean().default(false),
    max_agents:      z.number().int().min(1).max(200),
  }),
  rules: z.array(z.object({
    name:    z.string(),
    enabled: z.boolean().default(true),
  })),
})

function loadEngineConfig(path: string) {
  const raw    = readFileSync(path, 'utf8')
  const parsed = TOML.parse(raw)
  return YamtamTomlSchema.parse(parsed)
}
```

---

## Array of tables (TOML-specific syntax)

```toml
# config.toml
[[agent]]
name = "research-team"
tier = "power"

[[agent]]
name = "format-runner"
tier = "fast"
```

```javascript
const config = TOML.parse(raw)
// config.agent → [{ name: 'research-team', tier: 'power' }, ...]
for (const agent of config.agent as TOML.JsonMap[]) {
  console.log(agent.name, agent.tier)
}
```

---

## Stringify back to TOML

```javascript
const config = {
  engine: { version: '1.3.48', sandbox_enabled: true, max_agents: 87 },
}
const tomlStr = TOML.stringify(config)
writeFileSync('/tmp/engine.toml', tomlStr)
```

---

## Anti-Fake-Pass Checklist

```
❌ Accessing nested keys without optional chaining → TypeError on missing section
❌ TOML integers parsed as JS number → precision lost for int64 > Number.MAX_SAFE_INTEGER
❌ No schema validation after parse → type: any propagates downstream
❌ Datetime fields returned as JS Date objects → serialization changes on stringify
❌ Array of tables confused with inline arrays → [[x]] vs [x] semantics differ
❌ Syntax error not caught → crash without user-friendly message
```

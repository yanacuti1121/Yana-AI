---
name: ini-config-parsing
description: INI configuration file parsing for legacy and system configs. Flat and sectioned INI, special character handling, environment variable substitution, and safe stringify. Sources: isaacs/ini.
origin: yamtam-engine — synthesized from isaacs/ini (ISC License)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /ini-config-parsing

## When to Use

- Reading .npmrc, .pip/pip.ini, .gitconfig, or system-level INI configs
- Parsing agent hook configuration files written in INI format
- Simple flat key=value configs where JSON/TOML is overkill
- Writing back modified config while preserving structure

## Do NOT use for

- Configs requiring nested objects beyond one section level
- Binary or non-UTF8 config files

---

## Parse INI

```javascript
import ini from 'ini'
import { readFileSync } from 'fs'

// Flat INI
const flat = ini.parse('[global]\ntoken=abc\ntimeout=30')
// → { global: { token: 'abc', timeout: '30' } }
// Note: all values are strings — coerce as needed

// Load .npmrc
const npmrc = ini.parse(readFileSync('/home/user/.npmrc', 'utf8'))
const registry = npmrc.registry ?? 'https://registry.npmjs.org'
```

---

## Safe value coercion

```typescript
function getInt(config: Record<string, string>, key: string, fallback: number): number {
  const val = config[key]
  if (!val) return fallback
  const n = parseInt(val, 10)
  return Number.isFinite(n) ? n : fallback
}

function getBool(config: Record<string, string>, key: string, fallback: boolean): boolean {
  const val = config[key]?.toLowerCase()
  if (val === 'true'  || val === '1' || val === 'yes') return true
  if (val === 'false' || val === '0' || val === 'no')  return false
  return fallback
}
```

---

## Read/modify/write pattern

```javascript
import ini from 'ini'
import { readFileSync, writeFileSync } from 'fs'

function updateIniKey(filePath: string, section: string, key: string, value: string): void {
  const raw    = readFileSync(filePath, 'utf8')
  const config = ini.parse(raw)

  if (!config[section]) config[section] = {}
  config[section][key] = value

  writeFileSync(filePath, ini.stringify(config))
}

updateIniKey('/workspaces/.agentrc', 'sandbox', 'enabled', 'true')
```

---

## Special characters

```javascript
// ini.escape() handles = ; # in values
const config = { section: { path: '/usr/local/bin;/usr/bin', comment: 'has # char' } }
const str = ini.stringify(config)
// path = /usr/local/bin;/usr/bin   (semicolons in values are quoted)
```

---

## Anti-Fake-Pass Checklist

```
❌ Treating INI values as typed (all are strings) → parseInt undefined = NaN
❌ Section name collision with JS prototype → { constructor: {...} } pollutes proto
❌ Writing back unescaped special chars (= ; #) → parse fails on reload
❌ Empty file not handled → ini.parse('') returns {} — check before key access
❌ Multi-line values not supported by ini — use YAML/TOML for multiline configs
```

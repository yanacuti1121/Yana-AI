---
name: cli-config-persistence
description: Hierarchical JSON config persistence for CLI agent tools. sindresorhus/conf patterns, schema validation, encryption for secrets, config migration, and XDG-compliant storage paths. Sources: sindresorhus/conf.
origin: yana-ai — synthesized from sindresorhus/conf (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /cli-config-persistence

## When to Use

- Store persistent settings for yamtam CLI tools (session defaults, feature flags)
- Config that survives between terminal sessions in Codespaces
- Encrypted storage for API keys in CLI tools (avoid plain .env files)
- Typed config with JSON Schema validation at read/write time

## Do NOT use for

- Runtime session state (use in-memory or [[state-persistence-gateway]])
- Config shared across network (use CouchDB/PouchDB)

---

## Basic Conf setup

```javascript
import Conf from 'conf'

interface YamtamConfig {
  version:        string
  sandboxEnabled: boolean
  defaultTier:    'fast' | 'power'
  maxAgents:      number
  apiBaseUrl:     string
}

const config = new Conf<YamtamConfig>({
  projectName:   'yana-ai',
  projectVersion: '1.3.48',
  schema: {
    version:        { type: 'string' },
    sandboxEnabled: { type: 'boolean', default: true },
    defaultTier:    { type: 'string',  default: 'fast', enum: ['fast', 'power'] },
    maxAgents:      { type: 'number',  default: 87, minimum: 1, maximum: 500 },
    apiBaseUrl:     { type: 'string',  default: 'https://api.anthropic.com' },
  },
  // Config path: ~/.config/yana-ai/config.json (XDG)
})

// Read
const tier = config.get('defaultTier')    // 'fast'

// Write
config.set('sandboxEnabled', true)
config.set({ defaultTier: 'power', maxAgents: 100 })

// Delete
config.delete('apiBaseUrl')

// Reset to defaults
config.clear()
```

---

## Encrypted secrets store

```javascript
import Conf from 'conf'
import crypto from 'crypto'

const secrets = new Conf({
  projectName:     'yamtam-secrets',
  encryptionKey:   process.env.YAMTAM_CONFIG_KEY ?? crypto.randomBytes(32).toString('hex'),
  // → file on disk is AES-256-CBC encrypted — unreadable without key
})

secrets.set('anthropic.apiKey', process.env.ANTHROPIC_API_KEY)
const key = secrets.get('anthropic.apiKey') as string
```

---

## Config migration

```javascript
const config = new Conf({
  projectName: 'yana-ai',
  migrations: {
    '1.3.47': (store) => {
      // Rename old key
      if (store.has('enableSandbox')) {
        store.set('sandboxEnabled', store.get('enableSandbox'))
        store.delete('enableSandbox')
      }
    },
    '1.3.48': (store) => {
      // Add new key with default if missing
      if (!store.has('maxAgents')) store.set('maxAgents', 87)
    },
  },
})
```

---

## Config file path

```bash
# Linux:  ~/.config/yana-ai/config.json
# macOS:  ~/Library/Preferences/yana-ai/config.json
# Windows: %APPDATA%/yana-ai/config.json

# Print config location
node -e "const Conf=require('conf'); const c=new Conf({projectName:'yana-ai'}); console.log(c.path)"
```

---

## Anti-Fake-Pass Checklist

```
❌ No schema → config stores any type, validation errors discovered late
❌ encryptionKey hardcoded in source → secrets visible in git history
❌ encryptionKey not persisted → every process restart uses new key, can't decrypt
❌ No migration → config from old version causes schema validation failure
❌ Concurrent writes from multiple processes → file corruption (no locking)
❌ config.clear() in test → clears real user config on disk if projectName matches
```

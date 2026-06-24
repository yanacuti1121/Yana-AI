---
name: state-persistence-gateway
description: Selective state persistence with transform filters. redux-persist patterns, blacklist/whitelist keys, migration versioning, custom serialize/deserialize, and ephemeral-vs-durable state separation. Sources: rt2zz/redux-persist.
origin: yana-ai — synthesized from rt2zz/redux-persist (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /state-persistence-gateway

## When to Use

- Persist structured agent state across sessions while filtering ephemeral data
- Version-migrate persisted state when schema changes (v1.3.47 → v1.3.48)
- Separate durable state (skills used, rules applied) from transient (current tool call)
- Build state hydration on startup with conflict resolution

## Do NOT use for

- Simple key-value storage (use [[async-storage-patterns]] or [[cli-config-persistence]])
- Real-time sync (use [[pouchdb-sync-patterns]])

---

## State split: durable vs ephemeral

```typescript
interface AgentState {
  // DURABLE — persisted
  skillsIndex:   Record<string, number>  // skill name → use count
  rulesApplied:  string[]
  sessionCount:  number

  // EPHEMERAL — NOT persisted (filtered out)
  currentTool:   string | null
  pendingOutput: string
  rateLimit:     { remaining: number; resetAt: number }
}

// Keys to exclude from persistence
const EPHEMERAL_KEYS: (keyof AgentState)[] = [
  'currentTool',
  'pendingOutput',
  'rateLimit',
]
```

---

## Custom persist transform

```javascript
import { createTransform } from 'redux-persist'

const AgentTransform = createTransform(
  // serialize: before writing to storage — strip ephemeral keys
  (state, key) => {
    if (key === 'agent') {
      const { currentTool, pendingOutput, rateLimit, ...durable } = state
      return durable
    }
    return state
  },
  // deserialize: before hydrating from storage — set ephemeral defaults
  (state, key) => {
    if (key === 'agent') {
      return { ...state, currentTool: null, pendingOutput: '', rateLimit: { remaining: 100, resetAt: 0 } }
    }
    return state
  },
  { whitelist: ['agent'] }
)
```

---

## Schema migration

```javascript
const MIGRATIONS = {
  1: (state) => ({ ...state, sessionCount: state.sessionCount ?? 0 }),
  2: (state) => ({ ...state, skillsIndex: state.skillsIndex ?? {} }),
}

const persistConfig = {
  key:      'yamtam-root',
  version:  2,
  storage:  localforage,
  migrate:  createMigrate(MIGRATIONS, { debug: false }),
  transforms: [AgentTransform],
  blacklist: ['_persist'],
}
```

---

## File-based persistence (Node.js)

```typescript
import { writeFileSync, readFileSync, existsSync } from 'fs'

const STATE_FILE = '/workspaces/yana-ai/core/memory/agent-state.json'

function saveState(state: Partial<AgentState>): void {
  const { currentTool, pendingOutput, rateLimit, ...durable } = state as AgentState
  writeFileSync(STATE_FILE, JSON.stringify({ ...durable, _version: 2 }, null, 2))
}

function loadState(): Partial<AgentState> {
  if (!existsSync(STATE_FILE)) return {}
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}   // corrupted state — start fresh
  }
}
```

---

## Anti-Fake-Pass Checklist

```
❌ No blacklist/whitelist → persists rateLimit and currentTool (stale on reload)
❌ No migration → old state schema causes hydration crash on version bump
❌ State file world-readable → session data visible to all users
❌ writeFileSync on hot path → blocks event loop for large state objects
❌ No error handling on readFileSync → corrupted JSON crashes startup
❌ Sensitive data (tokens, keys) in persisted state → stored in plaintext
```

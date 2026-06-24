---
name: xstate-actor-model
description: XState finite state machines and actor model for agent lifecycle management. State/transition definitions, guards, actions, spawned child actors, and agent state visualization. Sources: statelyai/xstate (MIT).
origin: yana-ai — synthesized from statelyai/xstate (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.50
---

# /xstate-actor-model

## When to Use

- Model agent lifecycle explicitly: idle → running → awaiting-approval → isolated → stopped
- Prevent illegal state transitions (e.g., agent cannot run while isolated)
- Spawn child actors per task with isolated state machines
- Visualize agent state transitions for audit/debugging

## Do NOT use for

- Simple boolean flags (on/off, enabled/disabled)
- High-frequency event loops where FSM overhead is measurable

---

## Agent lifecycle state machine

```typescript
import { createMachine, createActor, assign } from 'xstate'

const agentMachine = createMachine({
  id:      'agent',
  initial: 'idle',
  context: { taskId: null as string | null, retries: 0 },

  states: {
    idle: {
      on: { START: { target: 'running', actions: assign({ taskId: ({ event }) => event.taskId }) } },
    },

    running: {
      on: {
        COMPLETE:       'idle',
        NEEDS_APPROVAL: 'awaiting-approval',
        ERROR:          { target: 'running', guard: ({ context }) => context.retries < 3,
                          actions: assign({ retries: ({ context }) => context.retries + 1 }) },
        FATAL:          'isolated',
      },
    },

    'awaiting-approval': {
      on: {
        APPROVED: 'running',
        DENIED:   'isolated',
        TIMEOUT:  'isolated',
      },
    },

    isolated: {
      type: 'final',
      entry: [() => console.log('[xstate] agent isolated — requires human review')],
    },
  },
})

const actor = createActor(agentMachine)
actor.subscribe(snapshot => {
  console.log('[xstate] state:', snapshot.value, '| context:', snapshot.context)
})
actor.start()
actor.send({ type: 'START', taskId: 'task-42' })
actor.send({ type: 'NEEDS_APPROVAL' })
actor.send({ type: 'APPROVED' })
actor.send({ type: 'COMPLETE' })
```

---

## Guards (conditional transitions)

```typescript
const machine = createMachine({
  // ...
  states: {
    running: {
      on: {
        ESCALATE: {
          target: 'escalated',
          guard: ({ context }) => context.trustScore < 50,
        },
      },
    },
  },
})
```

---

## Spawned child actor (task isolation)

```typescript
import { spawnChild, stopChild } from 'xstate'

const parentMachine = createMachine({
  context: { taskActor: null as any },
  states: {
    active: {
      on: {
        SPAWN_TASK: {
          actions: assign({
            taskActor: ({ spawn }) => spawn(taskMachine, { id: 'task' }),
          }),
        },
        STOP_TASK: {
          actions: [
            stopChild(({ context }) => context.taskActor),
            assign({ taskActor: null }),
          ],
        },
      },
    },
  },
})
```

---

## Persist and restore state

```typescript
// Persist snapshot to disk
const snapshot = actor.getSnapshot()
const persisted = JSON.stringify(snapshot)
await writeFile('agent-state.json', persisted)

// Restore on startup
const saved    = JSON.parse(await readFile('agent-state.json', 'utf8'))
const restored = createActor(agentMachine, { snapshot: agentMachine.resolveState(saved) })
restored.start()
console.log('[xstate] restored to:', restored.getSnapshot().value)
```

---

## Anti-Fake-Pass Checklist

```
❌ Sending events before actor.start() → events silently dropped
❌ Missing guard on retry loop → agent retries forever without a ceiling
❌ final state receives events → events after final are silently ignored; check state before sending
❌ assign() with mutation instead of pure function → context mutation breaks time-travel debugging
❌ Spawned actors not stopped on parent stop → memory leak from orphaned child actors
❌ Serializing actor (not snapshot) → actor contains callbacks, not serializable
```

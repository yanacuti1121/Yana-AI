---
name: state-machine-workflows
description: State machine and durable workflow patterns for AI agents. FSM-driven agent state, XState statecharts, Temporal durable execution, input validation at every transition, and memory-efficient state switches. Sources: statelyai/xstate, jakesgordon/javascript-state-machine, temporalio/temporal, chriso/validator.js, jlongster/fsm-utils.
origin: yana-ai — synthesized from statelyai/xstate, jakesgordon/javascript-state-machine, temporalio/temporal, chriso/validator.js (validatorjs), jlongster/fsm-utils
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.43
---

# /state-machine-workflows

## When to Use

- Agent has multi-step workflow where wrong state order = broken output
- "Agent keeps restarting the same step" or "loses progress on failure"
- Long-running tasks that must survive disconnection and resume
- Input validation required at each stage transition

## Do NOT use for

- Single-step tool calls (no state needed)
- Workflows with < 3 states

---

## Agent FSM (XState)

```typescript
import { createMachine, interpret } from 'xstate'

const agentMachine = createMachine({
  id: 'agent-task',
  initial: 'idle',
  states: {
    idle:       { on: { START: 'planning' } },
    planning:   { on: { PLAN_DONE: 'executing', FAIL: 'failed' } },
    executing:  { on: { STEP_DONE: 'reviewing', FAIL: 'failed' } },
    reviewing:  { on: { APPROVED: 'done', REJECTED: 'planning' } },
    done:       { type: 'final' },
    failed:     { on: { RETRY: 'planning', ABORT: 'idle' } },
  },
})

const service = interpret(agentMachine)
  .onTransition(state => console.log(`[FSM] → ${state.value}`))
  .start()

service.send('START')      // idle → planning
service.send('PLAN_DONE')  // planning → executing
// Invalid: service.send('APPROVED') from executing → rejected (no such transition)
// XState enforces: undefined transition = no state change (not crash)
```

---

## Minimal FSM (javascript-state-machine)

```javascript
import StateMachine from 'javascript-state-machine'

// Lightweight — no dependencies, 3KB
const fsm = new StateMachine({
  init: 'idle',
  transitions: [
    { name: 'research', from: 'idle',      to: 'researching' },
    { name: 'draft',    from: 'researching', to: 'drafting' },
    { name: 'submit',   from: 'drafting',   to: 'submitted' },
    { name: 'fail',     from: '*',          to: 'failed' },
    { name: 'reset',    from: 'failed',     to: 'idle' },
  ],
  methods: {
    onResearch() { console.log('Starting research phase') },
    onDraft()    { console.log('Drafting response') },
  }
})

// Guard against invalid transitions (never let agent skip states)
if (fsm.can('draft')) {
  fsm.draft()
} else {
  console.error(`Cannot draft from state: ${fsm.state}`)
}
```

---

## Durable Execution (Temporal)

```typescript
import { proxyActivities } from '@temporalio/workflow'

// Workflow: survives worker restart mid-execution
export async function agentResearchWorkflow(topic: string): Promise<string> {
  const { searchWeb, summarize, validateOutput } = proxyActivities({
    startToCloseTimeout: '5 minutes',
    retry: { maximumAttempts: 3, initialInterval: '1s', backoffCoefficient: 2 },
  })

  const rawResults = await searchWeb(topic)         // step 1 — persisted
  const summary    = await summarize(rawResults)    // step 2 — persisted
  const validated  = await validateOutput(summary)  // step 3 — persisted

  return validated
  // If worker crashes after step 2: resumes from step 3, not step 1
  // State is durable — stored in Temporal server between steps
}
```

---

## Input Validation at Every Transition (validator.js)

```javascript
import validator from 'validator'

// Validate at each FSM state transition — never trust state input
const TRANSITION_VALIDATORS = {
  planning: (input) => ({
    taskId:  validator.isUUID(input.taskId || ''),
    query:   validator.isLength(input.query || '', { min: 3, max: 2000 }),
    scope:   ['read', 'write', 'deploy'].includes(input.scope),
  }),
  executing: (input) => ({
    toolName: validator.isAlphanumeric((input.toolName || '').replace(/-/g, '')),
    params:   typeof input.params === 'object' && input.params !== null,
  }),
}

function transitionWithValidation(fsm, event, input) {
  const validator_ = TRANSITION_VALIDATORS[event]
  if (validator_) {
    const checks = validator_(input)
    const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k)
    if (failed.length) throw new Error(`Transition blocked: invalid fields ${failed.join(', ')}`)
  }
  fsm.send(event)
}
```

---

## Memory-Efficient State Switch (fsm-utils pattern)

```javascript
// Problem: storing full history for 10k+ state transitions = memory leak
// Solution: ring buffer — keep last N transitions only

class AgentStateHistory {
  #buf; #size; #head = 0; #count = 0

  constructor(size = 100) { this.#size = size; this.#buf = new Array(size) }

  push(state) {
    this.#buf[this.#head] = { state, ts: Date.now() }
    this.#head = (this.#head + 1) % this.#size
    this.#count = Math.min(this.#count + 1, this.#size)
  }

  last(n = 10) {
    return Array.from({ length: Math.min(n, this.#count) }, (_, i) =>
      this.#buf[(this.#head - 1 - i + this.#size) % this.#size]
    )
  }
}

// Rule: never store unbounded transition history (use ring buffer or last-N)
```

---

## Anti-Fake-Pass Checklist

```
❌ Agent allowed to skip states by calling transitions out of order
❌ No validation on state transition input (garbage in → broken execution)
❌ Temporal workflow without retry policy (single failure = lost work)
❌ FSM state history stored as unbounded array (memory leak on long runs)
❌ State machine has no 'failed' state (unhandled errors = undefined state)
❌ Durable workflow with blocking sleep > timeout (Temporal heartbeat needed)
```

---
name: wamp-pubsub-patterns
description: WAMP (Web Application Messaging Protocol) secure Pub/Sub for distributed agent event bus. Autobahn|JS patterns, authenticated subscriptions, RPC over WAMP, topic-based routing, and cryptographic message signing. Sources: crossbario/autobahn-js.
origin: yana-ai — synthesized from crossbario/autobahn-js (MIT), WAMP spec v2
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /wamp-pubsub-patterns

## When to Use

- Replace raw Swarm Bus (agent-message-bus.sh) with a proper protocol for inter-agent messaging
- Event-driven agent orchestration: agent A publishes "task.complete", agent B subscribes
- RPC over WAMP: agent A calls a procedure on agent B's router
- Cryptographically authenticated topic subscriptions

## Do NOT use for

- Simple local inter-process messaging (use [[async-event-emitter]] instead)
- High-frequency metrics streaming (use [[statsd-metrics-streaming]])

---

## Connect and subscribe

```javascript
import autobahn from 'autobahn'

const connection = new autobahn.Connection({
  url:   'ws://localhost:8080/ws',
  realm: 'yamtam-swarm',
  authmethods: ['ticket'],
  authid: process.env.YAMTAM_AGENT_ID,
  onchallenge: (_session, method) => {
    if (method === 'ticket') return process.env.YAMTAM_AGENT_TOKEN!
    throw new Error(`[wamp] unsupported auth: ${method}`)
  },
})

connection.onopen = async (session) => {
  console.log('[wamp] connected as', session.id)

  // Subscribe to task events
  await session.subscribe('yamtam.task.complete', (args, kwargs) => {
    console.log('[wamp] task complete:', kwargs)
  })

  // Subscribe with options (wildcard)
  await session.subscribe('yamtam.agent..status', (args, kwargs, details) => {
    console.log('[wamp] agent status update from:', details.topic)
  }, { match: 'wildcard' })
}

connection.open()
```

---

## Publish with signed payload

```javascript
import { signCommand } from './ecc-key-management.js'

connection.onopen = async (session) => {
  const payload = {
    agentId:   process.env.YAMTAM_AGENT_ID,
    action:    'task.start',
    command:   'sandbox-exec agent-script.sh',
    ts:        Date.now(),
    nonce:     Math.random().toString(36),
  }

  const signature = signCommand(
    process.env.YAMTAM_AGENT_PRIV!,
    JSON.stringify(payload)
  )

  await session.publish('yamtam.task.dispatch', [], {
    ...payload,
    signature,
  }, { acknowledge: true })

  console.log('[wamp] published signed task')
}
```

---

## RPC registration (agent exposes procedures)

```javascript
connection.onopen = async (session) => {
  // Register a callable procedure
  await session.register('yamtam.agent.run-tool', async (args, kwargs) => {
    const { tool, params } = kwargs
    // Verify caller signature before executing
    if (!verifyCommand(kwargs.pubKey, JSON.stringify({ tool, params }), kwargs.sig)) {
      throw new autobahn.Error('yamtam.error.unauthorized', ['invalid signature'])
    }
    return { result: await runTool(tool, params) }
  })

  // Call a procedure on another agent
  const result = await session.call('yamtam.agent.run-tool', [], {
    tool:   'fetch',
    params: { url: 'https://api.github.com/zen' },
    pubKey: myPubKey,
    sig:    signCommand(myPrivKey, JSON.stringify({ tool: 'fetch', params: {} })),
  })
}
```

---

## Anti-Fake-Pass Checklist

```
❌ No authmethods → anonymous WAMP connection, any process can publish/subscribe
❌ Wildcard subscriptions without ACL → agent subscribes to all topics
❌ RPC without caller signature verification → any authenticated agent can invoke any procedure
❌ connection.onclose not handled → reconnection logic missing on network drop
❌ Realm not isolated per environment → dev/prod agents share topic space
❌ session.publish without acknowledge:true → no delivery confirmation for critical commands
```

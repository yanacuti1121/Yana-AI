---
name: protobufjs-dynamic-schema
description: protobuf.js dynamic .proto parsing and code generation for Node.js. Runtime schema loading, static code generation, reflection API, and JSON interop for agent message contracts. Sources: protobufjs/protobuf.js (BSD-3-Clause).
origin: yana-ai — synthesized from protobufjs/protobuf.js (BSD-3-Clause)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.50
---

# /protobufjs-dynamic-schema

## When to Use

- Load .proto schemas dynamically at agent startup without build-time codegen
- Generate TypeScript interfaces from .proto for type-safe message handling
- Reflection: enumerate all message fields at runtime for generic serializers
- JSON ↔ Protobuf interop: accept JSON from external APIs, emit Protobuf internally

## Do NOT use for

- Performance-critical paths (static generated code is 2× faster than dynamic loading)
- gRPC service definitions (use [[grpc-streaming-rpc]] which wraps protobufjs)

---

## Dynamic load and use

```javascript
import protobuf from 'protobufjs'

// Load at startup, cache root — never reload per message
const root = await protobuf.load(['agent_message.proto', 'task.proto'])

const AgentMessage = root.lookupType('yamtam.AgentMessage')
const TaskPayload  = root.lookupType('yamtam.TaskPayload')

export function encodeAgentMessage(data: object): Buffer {
  const err = AgentMessage.verify(data)
  if (err) throw new Error(`[protobuf] ${err}`)
  return Buffer.from(AgentMessage.encode(AgentMessage.create(data)).finish())
}

export function decodeAgentMessage(buf: Buffer): object {
  const msg = AgentMessage.decode(buf)
  return AgentMessage.toObject(msg, {
    longs:   String,   // int64 → string (avoids JS precision loss)
    enums:   String,   // enum number → name
    bytes:   String,   // bytes → base64 string
    defaults: true,    // include fields with default values
  })
}
```

---

## Static codegen (for production)

```bash
# Generate JS + TypeScript declarations
npx pbjs  -t static-module -w es6 -o src/generated/protos.js  *.proto
npx pbts  -o src/generated/protos.d.ts  src/generated/protos.js

# Generated usage (2× faster than dynamic, fully typed)
import { yamtam } from './generated/protos'

const msg = yamtam.AgentMessage.create({ agentId: 'x', seq: 1 })
const buf = yamtam.AgentMessage.encode(msg).finish()
```

---

## Reflection API (enumerate message fields)

```javascript
const AgentMessage = root.lookupType('yamtam.AgentMessage')

// List all fields
for (const field of AgentMessage.fieldsArray) {
  console.log(`  ${field.id}: ${field.name} (${field.type})`)
}

// Check if a field exists by name
const hasPayload = !!AgentMessage.fields['payload']

// Nested message types
const nested = AgentMessage.resolvedFields
  .filter(f => f.resolvedType instanceof protobuf.Type)
  .map(f => f.resolvedType.name)
```

---

## JSON ↔ Protobuf conversion

```javascript
// JSON from external API → Protobuf binary
function jsonToProto(jsonObj: object): Buffer {
  const msg = AgentMessage.fromObject(jsonObj)   // lenient: coerces types
  const err = AgentMessage.verify(msg)
  if (err) throw new Error(`[protobuf] ${err}`)
  return Buffer.from(AgentMessage.encode(msg).finish())
}

// Protobuf binary → JSON (for logging/debugging)
function protoToJson(buf: Buffer): string {
  const msg = AgentMessage.decode(buf)
  return JSON.stringify(AgentMessage.toObject(msg, { longs: String, enums: String }))
}
```

---

## Anti-Fake-Pass Checklist

```
❌ protobuf.load() called per message → filesystem + parse overhead on every encode
❌ AgentMessage.create() skipped → encode() accepts plain objects but skips field defaults
❌ longs: Number in toObject → int64 precision loss above Number.MAX_SAFE_INTEGER
❌ Dynamic schema in production hot path → use static codegen (pbjs) for 2× throughput
❌ lookupType() throws if package prefix wrong — use full name: 'yamtam.AgentMessage' not 'AgentMessage'
❌ Missing .proto file at load path → protobuf.load() throws, no fallback
```

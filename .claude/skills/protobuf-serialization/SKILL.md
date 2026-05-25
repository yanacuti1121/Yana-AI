---
name: protobuf-serialization
description: Protocol Buffers binary serialization for inter-agent messaging. .proto schema definition, encode/decode, backward-compatible field evolution, and performance benchmarks vs JSON. Sources: protocolbuffers/protobuf (BSD-3-Clause).
origin: yamtam-engine — synthesized from protocolbuffers/protobuf (BSD-3-Clause)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.50
---

# /protobuf-serialization

## When to Use

- Replace JSON in inter-agent message bus for 5–10× smaller payloads
- Schema-enforced contracts: agents reject malformed messages at decode time
- Backward-compatible versioning: add fields without breaking old agents
- High-frequency event streams where JSON parsing is a CPU bottleneck

## Do NOT use for

- Human-readable config files (use YAML/TOML)
- Simple key-value stores (use [[cli-config-persistence]])

---

## .proto schema

```protobuf
// agent_message.proto
syntax = "proto3";
package yamtam;

message AgentMessage {
  string  agent_id  = 1;
  uint32  seq       = 2;
  int64   ts_ms     = 3;
  Opcode  opcode    = 4;
  bytes   payload   = 5;

  enum Opcode {
    UNKNOWN   = 0;
    TASK      = 1;
    ACK       = 2;
    HEARTBEAT = 3;
    REVOKE    = 4;
  }
}

message TaskPayload {
  string tool        = 1;
  string params_json = 2;
  uint32 priority    = 3;
}
```

---

## Encode / decode (protobufjs runtime)

```javascript
import protobuf from 'protobufjs'

const root = await protobuf.load('agent_message.proto')
const AgentMessage = root.lookupType('yamtam.AgentMessage')

// Encode
const msg = {
  agentId: 'did:yamtam:0xabc123',
  seq:     42,
  tsMs:    BigInt(Date.now()),
  opcode:  1,  // TASK
  payload: Buffer.from(JSON.stringify({ tool: 'bash', params: { cmd: 'ls' } })),
}
const errMsg = AgentMessage.verify(msg)
if (errMsg) throw new Error(`[protobuf] invalid: ${errMsg}`)

const encoded = AgentMessage.encode(AgentMessage.create(msg)).finish()
console.log(`Encoded: ${encoded.length} bytes`)  // vs ~120 bytes JSON

// Decode
const decoded = AgentMessage.decode(encoded)
console.log(AgentMessage.toObject(decoded, { longs: String }))
```

---

## Field evolution rules (backward compatibility)

```
SAFE changes:
  ✅ Add new optional field with new field number
  ✅ Rename field (field number is the wire identity, not name)
  ✅ Change field to repeated (if was singular)

BREAKING changes:
  ❌ Remove a field number — old agents send it, new agents silently drop it
  ❌ Reuse a field number for different type — wire corruption
  ❌ Change field type (string→int) — decode error
  ❌ Rename enum values — values are numbers on wire; name change is safe
```

---

## Dynamic schema loading at runtime

```javascript
// Load .proto from string without file system
const root = protobuf.parse(`
  syntax = "proto3";
  message Ping { string id = 1; int64 ts = 2; }
`).root

const Ping    = root.lookupType('Ping')
const encoded = Ping.encode({ id: 'agent-1', ts: Date.now() }).finish()
const decoded = Ping.decode(encoded)
```

---

## Anti-Fake-Pass Checklist

```
❌ Not calling AgentMessage.verify() before encode → invalid fields silently truncated
❌ Reusing field number after removal → wire corruption for old agents still sending the field
❌ int64 fields as JS number → precision loss above 2^53; use longs: String or longs: Long
❌ bytes field with string input → protobufjs silently encodes UTF-8, not raw bytes
❌ Missing syntax = "proto3" → proto2 semantics, required fields break things
❌ Loading .proto in hot path → cache root object, never re-parse per message
```

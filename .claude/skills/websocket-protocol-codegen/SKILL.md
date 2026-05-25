---
name: websocket-protocol-codegen
description: Low-level WebSocket protocol implementation patterns and code generation for network data structures. Frame parsing, ping/pong keepalive, binary protocol codegen from schema, and bandwidth-optimized message design. Sources: warmcat/libwebsockets (MIT).
origin: yamtam-engine — synthesized from warmcat/libwebsockets (MIT), RFC 6455 WebSocket spec
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /websocket-protocol-codegen

## When to Use

- Design binary WebSocket protocol frames for inter-agent communication
- Code-generate message serialization/deserialization from a schema definition
- Implement keepalive, reconnect, and framing logic for custom agent transport
- Bandwidth optimization: pack multiple agent events into binary frames

## Do NOT use for

- Simple JSON-over-WebSocket apps (use ws/Socket.IO directly)
- High-level Pub/Sub (use [[wamp-pubsub-patterns]])

---

## RFC 6455 frame layout (reference)

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-------+-+-------------+-------------------------------+
|F|R|R|R| opcode|M| Payload len |    Extended payload length    |
|I|S|S|S|  (4)  |A|     (7)    |             (16/64)           |
|N|V|V|V|       |S|             |   (if payload len==126/127)   |
| |1|2|3|       |K|             |                               |
+-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - -+
Opcodes: 0x0 continuation, 0x1 text, 0x2 binary, 0x8 close, 0x9 ping, 0xA pong
```

---

## Binary protocol schema → codegen

```typescript
// Protocol definition
interface AgentFrame {
  version:   1               // 1 byte
  opcode:    FrameOp         // 1 byte: 0x01=task, 0x02=ack, 0x03=heartbeat
  agentId:   string          // 8 bytes (truncated SHA256)
  sequence:  number          // 4 bytes uint32
  payload:   Buffer          // variable
}

enum FrameOp { TASK = 0x01, ACK = 0x02, HEARTBEAT = 0x03 }

// Encoder
function encodeFrame(frame: AgentFrame): Buffer {
  const idBytes  = Buffer.from(frame.agentId.slice(0, 8).padEnd(8, '\0'))
  const header   = Buffer.allocUnsafe(14)
  header.writeUInt8(frame.version,  0)
  header.writeUInt8(frame.opcode,   1)
  idBytes.copy(header, 2)
  header.writeUInt32BE(frame.sequence, 10)
  return Buffer.concat([header, frame.payload])
}

// Decoder
function decodeFrame(buf: Buffer): AgentFrame {
  return {
    version:  buf.readUInt8(0),
    opcode:   buf.readUInt8(1) as FrameOp,
    agentId:  buf.slice(2, 10).toString('utf8').replace(/\0/g, ''),
    sequence: buf.readUInt32BE(10),
    payload:  buf.slice(14),
  }
}
```

---

## WebSocket server with ping/pong keepalive

```javascript
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ port: 8080 })
const PING_INTERVAL  = 30_000  // 30s
const PONG_TIMEOUT   = 10_000  // close if no pong within 10s

wss.on('connection', (ws) => {
  let alive = true
  ws.on('pong', () => { alive = true })

  const keepalive = setInterval(() => {
    if (!alive) { ws.terminate(); return }
    alive = false
    ws.ping()
  }, PING_INTERVAL)

  ws.on('close', () => clearInterval(keepalive))

  ws.on('message', (data: Buffer) => {
    const frame = decodeFrame(data)
    if (frame.opcode === FrameOp.TASK) {
      // handle task
      ws.send(encodeFrame({ ...frame, opcode: FrameOp.ACK, payload: Buffer.alloc(0) }))
    }
  })
})
```

---

## Auto-generate protocol serializer from field schema

```typescript
// Schema-driven codegen: fields → encode/decode functions
function generateSerializer(schema: { name: string; type: 'uint8'|'uint32'|'bytes8'|'string' }[]) {
  let offset = 0
  const encodeLines: string[] = []
  const decodeLines: string[] = []

  for (const field of schema) {
    switch (field.type) {
      case 'uint8':
        encodeLines.push(`buf.writeUInt8(obj.${field.name}, ${offset})`)
        decodeLines.push(`${field.name}: buf.readUInt8(${offset})`)
        offset += 1; break
      case 'uint32':
        encodeLines.push(`buf.writeUInt32BE(obj.${field.name}, ${offset})`)
        decodeLines.push(`${field.name}: buf.readUInt32BE(${offset})`)
        offset += 4; break
      case 'bytes8':
        encodeLines.push(`Buffer.from(obj.${field.name}).copy(buf, ${offset})`)
        decodeLines.push(`${field.name}: buf.slice(${offset}, ${offset + 8}).toString()`)
        offset += 8; break
    }
  }

  return {
    encode: new Function('obj', `const buf = Buffer.allocUnsafe(${offset}); ${encodeLines.join('; ')}; return buf`),
    decode: new Function('buf', `return { ${decodeLines.join(', ')} }`),
  }
}
```

---

## Anti-Fake-Pass Checklist

```
❌ ws.ping() without checking ws.readyState === OPEN → throws on closed socket
❌ Buffer.allocUnsafe without filling → uninitialized memory in frames (security issue)
❌ No ping/pong → zombie connections consume server memory indefinitely
❌ Binary frames with no version byte → impossible to add fields without breaking old clients
❌ Frame sequence number overflow at uint32 max → not handled → sequence resets silently
❌ String fields without length prefix → variable-length strings corrupt fixed-offset decoder
```

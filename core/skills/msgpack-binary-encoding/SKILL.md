---
name: msgpack-binary-encoding
description: MessagePack binary encoding for compact inter-agent payloads. Pack/unpack, typed arrays, extension types, streaming decoder, and performance comparison with JSON. Sources: msgpack/msgpack-javascript (ISC).
origin: yana-ai — synthesized from msgpack/msgpack-javascript (ISC)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.50
---

# /msgpack-binary-encoding

## When to Use

- Replace JSON in high-frequency agent message buses (2–4× smaller, faster encode/decode)
- Preserve types that JSON loses: Buffer/Uint8Array, Map, Date, undefined
- Streaming decode: process large payloads chunk-by-chunk without buffering all at once
- Custom extension types: encode domain objects (AgentID, DID) as compact binary

## Do NOT use for

- Human-readable config or logs (use JSON/YAML)
- Schema-enforced contracts with field versioning (use [[protobuf-serialization]])

---

## Encode / decode

```javascript
import { encode, decode } from '@msgpack/msgpack'

// Encode: any JS value → Uint8Array
const payload = {
  agentId: 'did:yamtam:0xabc123',
  seq:     42,
  ts:      Date.now(),
  data:    new Uint8Array([1, 2, 3, 4]),  // preserved as binary (JSON would lose this)
  meta:    new Map([['priority', 'high']]), // Map preserved (JSON stringifies to {})
}

const packed   = encode(payload)
console.log(`msgpack: ${packed.byteLength} bytes`)  // ~40% smaller than JSON

const unpacked = decode(packed)
console.log(unpacked.agentId)  // 'did:yamtam:0xabc123'
```

---

## Custom extension type (register domain type)

```typescript
import { encode, decode, ExtensionCodec } from '@msgpack/msgpack'

const EXT_AGENT_ID = 1  // extension type code (0–127)

const extensionCodec = new ExtensionCodec()

extensionCodec.register({
  type:  EXT_AGENT_ID,
  encode(obj: unknown): Uint8Array | null {
    if (typeof obj === 'object' && obj !== null && 'did' in obj) {
      return new TextEncoder().encode((obj as any).did)
    }
    return null
  },
  decode(data: Uint8Array) {
    return { did: new TextDecoder().decode(data) }
  },
})

const packed   = encode({ agent: { did: 'did:yamtam:0xabc' } }, { extensionCodec })
const unpacked = decode(packed, { extensionCodec })
// unpacked.agent → { did: 'did:yamtam:0xabc' }
```

---

## Streaming decode (large payloads)

```javascript
import { Decoder } from '@msgpack/msgpack'

const decoder = new Decoder()

// Feed chunks from a readable stream
async function decodeStream(readable) {
  const results = []
  for await (const chunk of readable) {
    const decoded = decoder.decodeMulti(chunk)
    for (const value of decoded) {
      results.push(value)
    }
  }
  return results
}
```

---

## Performance comparison

```javascript
import { encode, decode } from '@msgpack/msgpack'

const sample = { agentId: 'did:yamtam:abc', seq: 999, ts: Date.now(), data: Array(100).fill(42) }

// JSON
console.time('json-encode')
for (let i = 0; i < 10_000; i++) JSON.stringify(sample)
console.timeEnd('json-encode')  // ~120ms

console.time('msgpack-encode')
for (let i = 0; i < 10_000; i++) encode(sample)
console.timeEnd('msgpack-encode')  // ~30ms

// Sizes
const jsonBytes    = Buffer.byteLength(JSON.stringify(sample))
const msgpackBytes = encode(sample).byteLength
console.log(`JSON: ${jsonBytes}B  MsgPack: ${msgpackBytes}B`)
```

---

## Anti-Fake-Pass Checklist

```
❌ decode(packed) without matching extensionCodec → ext types decoded as raw bytes
❌ encode(Map) without forceIntegerToFloat: false → Map keys lose integer types
❌ Passing Node Buffer directly to decode() → must wrap: decode(new Uint8Array(buf))
❌ Extension type code > 127 → reserved for msgpack spec; use 0–127 only
❌ Streaming decoder not reset between messages → state corrupted if chunk boundary mid-value
❌ Assuming msgpack is always smaller than JSON — for strings-only payloads JSON can be smaller
```

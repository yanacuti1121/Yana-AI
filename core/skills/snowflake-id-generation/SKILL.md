---
name: snowflake-id-generation
description: Twitter Snowflake-style distributed unique ID generation. Time-ordered 64-bit IDs, worker/datacenter bits, clock skew handling, and monotonic guarantees for distributed event sequencing. Sources: bwmarrin/snowflake (BSD-2-Clause).
origin: yana-ai — synthesized from bwmarrin/snowflake (BSD-2-Clause), Twitter Snowflake design
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.50
---

# /snowflake-id-generation

## When to Use

- Generate globally unique IDs across distributed agents without coordination
- Time-ordered IDs: sort by ID = sort by creation time (useful for event logs)
- Replace UUID v4 where sortability matters
- High-throughput: 4096 IDs per millisecond per worker node

## Do NOT use for

- Human-readable IDs (use slug + nanoid)
- IDs that must be unpredictable (Snowflake encodes timestamp — use UUIDv4 for secrets)

---

## Snowflake bit layout (64-bit)

```
 63      62       22      12       0
  |       |        |       |       |
  0 [sign] [41-bit ms timestamp] [10-bit worker] [12-bit seq]

  timestamp = ms since custom epoch (e.g. 2024-01-01 00:00:00 UTC)
  worker    = datacenter(5 bits) + node(5 bits) = 0–1023
  sequence  = 0–4095 per ms per worker (auto-reset each ms)

Max IDs/sec per worker: 4096 * 1000 = 4,096,000
Safe until: ~year 2158 (41-bit ms from epoch 2024)
```

---

## Node.js implementation

```typescript
const EPOCH = BigInt(new Date('2024-01-01').getTime())  // custom epoch
const WORKER_ID_BITS = 10n
const SEQUENCE_BITS  = 12n
const MAX_SEQUENCE   = (1n << SEQUENCE_BITS) - 1n  // 4095

class SnowflakeGenerator {
  private workerId:   bigint
  private sequence:   bigint = 0n
  private lastMs:     bigint = -1n

  constructor(workerId: number) {
    if (workerId < 0 || workerId > 1023)
      throw new Error('[snowflake] workerId must be 0–1023')
    this.workerId = BigInt(workerId)
  }

  next(): bigint {
    let ms = BigInt(Date.now()) - EPOCH

    if (ms === this.lastMs) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE
      if (this.sequence === 0n) {
        // Sequence exhausted — wait for next ms
        while (ms <= this.lastMs) ms = BigInt(Date.now()) - EPOCH
      }
    } else {
      this.sequence = 0n
    }

    this.lastMs = ms

    return (ms << (WORKER_ID_BITS + SEQUENCE_BITS)) |
           (this.workerId << SEQUENCE_BITS) |
           this.sequence
  }

  nextString(): string { return this.next().toString() }
}

// Usage
const gen = new SnowflakeGenerator(1)  // worker 1
const id  = gen.nextString()           // '7234891234567890001'
```

---

## Extract timestamp from Snowflake ID

```typescript
function snowflakeToDate(id: string): Date {
  const bits      = BigInt(id)
  const tsMsEpoch = bits >> (WORKER_ID_BITS + SEQUENCE_BITS)
  return new Date(Number(tsMsEpoch + EPOCH))
}

console.log(snowflakeToDate('7234891234567890001'))
// 2024-05-23T...
```

---

## Clock skew guard

```typescript
// If system clock jumps backward, refuse to generate (would produce duplicate IDs)
next(): bigint {
  let ms = BigInt(Date.now()) - EPOCH
  if (ms < this.lastMs) {
    throw new Error(`[snowflake] clock moved backward by ${this.lastMs - ms}ms — refusing to generate`)
  }
  // ... rest of generation
}
```

---

## Anti-Fake-Pass Checklist

```
❌ Worker ID collision across nodes → two generators emit same IDs for same ms+seq
❌ Custom epoch in the future → timestamps become negative bigints immediately
❌ Snowflake ID as JS number → 64-bit integers exceed Number.MAX_SAFE_INTEGER; always use BigInt/string
❌ No clock skew guard → NTP correction backward → IDs with duplicate timestamp bits
❌ sequence reset on every call (not per-ms) → 4095 IDs total then exhausted
❌ Sharing one generator across async contexts → sequence increment is not atomic; use mutex
```

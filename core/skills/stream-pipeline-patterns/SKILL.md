---
name: stream-pipeline-patterns
description: Node.js stream pipeline management with automatic cleanup. pump/pipeline error propagation, transform stream chains, backpressure handling, and preventing stream leaks when one stage errors. Sources: mafintosh/pump, Node.js stream.pipeline.
origin: yana-ai — synthesized from mafintosh/pump (MIT), Node.js stream.pipeline docs
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /stream-pipeline-patterns

## When to Use

- Chaining compress → encrypt → write streams with proper error cleanup
- Processing large log files or archives without loading into memory
- Ensuring all streams in a pipeline are destroyed if any one errors
- Replacing manual `.pipe()` chains that leak on errors

## Do NOT use for

- One-shot small data (< 10MB) — just use `fs.readFileSync` / `Buffer`
- Async iterables (use `for await...of` with stream iteration instead)

---

## pump (auto-cleanup on error)

```javascript
import pump  from 'pump'
import { createReadStream, createWriteStream } from 'fs'
import { createGzip } from 'zlib'

// If any stream errors, ALL streams are destroyed and callback fires
pump(
  createReadStream('/tmp/agent.log'),
  createGzip(),
  createWriteStream('/tmp/agent.log.gz'),
  (err) => {
    if (err) console.error('[pump] pipeline error:', err.message)
    else      console.log('[pump] done')
  }
)
```

---

## stream.pipeline (built-in Node.js ≥ 10)

```javascript
import { pipeline } from 'stream/promises'
import { createReadStream, createWriteStream } from 'fs'
import { createBrotliCompress } from 'zlib'

// Awaitable pipeline — throws on error, cleans up all streams
async function compressLog(input: string, output: string): Promise<void> {
  await pipeline(
    createReadStream(input),
    createBrotliCompress(),
    createWriteStream(output)
  )
}
```

---

## Transform stream chain

```javascript
import { Transform } from 'stream'
import { pipeline }  from 'stream/promises'

const lineCounter = new Transform({
  transform(chunk, _enc, cb) {
    const lines = chunk.toString().split('\n').length - 1
    this.lineCount = (this.lineCount ?? 0) + lines
    cb(null, chunk)
  },
})

const jsonFilter = new Transform({
  transform(chunk, _enc, cb) {
    const filtered = chunk.toString()
      .split('\n')
      .filter(line => { try { JSON.parse(line); return true } catch { return false } })
      .join('\n')
    cb(null, filtered)
  },
})

await pipeline(
  createReadStream('/tmp/audit.log'),
  jsonFilter,
  lineCounter,
  createWriteStream('/tmp/audit-clean.log')
)
```

---

## Backpressure: respect highWaterMark

```javascript
const readable = createReadStream('/tmp/huge.log', {
  highWaterMark: 64 * 1024,  // 64KB chunks
})

// pipeline handles backpressure automatically
// manual .pipe() requires checking write.write() return value
```

---

## Anti-Fake-Pass Checklist

```
❌ Manual .pipe() without error handlers → source stream not destroyed on dest error
❌ pump callback-style — must handle null err case, not just error case
❌ stream.pipeline (non-promise) vs stream/promises — different import paths
❌ Transform pushes data after calling cb(err) → double-emit crash
❌ highWaterMark too large → buffers entire file in memory despite streaming intent
❌ pipeline with async generator → must use Node.js 16+ for full support
```

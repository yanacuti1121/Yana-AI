---
name: memory-leak-detection
description: Node.js memory leak detection and heap profiling. node-memwatch heap diffing, V8 heap snapshots, GC event monitoring, heap growth trending, and leak remediation patterns. Sources: lloyd/node-memwatch, Node.js v8 module.
origin: yana-ai — synthesized from lloyd/node-memwatch (BSD-2-Clause), Node.js v8 heap docs
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /memory-leak-detection

## When to Use

- Long-running agent sessions accumulating heap without releasing
- Debugging why sandbox process is OOM-killed after hours of operation
- Validating that event listeners and streams are properly cleaned up
- Heap diffing to identify which objects grow between requests

## Do NOT use for

- One-shot scripts (leak only matters for long-running processes)
- Production traffic interception (heap snapshots block the event loop)

---

## Heap leak detector (memwatch-next)

```javascript
import memwatch from 'memwatch-next'

// 'leak' fires when heap grows 5 consecutive GC cycles
memwatch.on('leak', (info) => {
  console.error('[memwatch] LEAK DETECTED', JSON.stringify(info))
  // info: { start, end, growth, reason }
  // growth is bytes added since last GC
})

// GC stats after every garbage collection
memwatch.on('stats', (stats) => {
  if (stats.current_base > 200 * 1024 * 1024) {  // 200MB threshold
    console.warn('[memwatch] heap baseline high:', Math.round(stats.current_base / 1024**2), 'MB')
  }
})
```

---

## Heap diff to find leaked objects

```javascript
import memwatch from 'memwatch-next'

// Perform an action twice, diff heap to see what objects grew
const hd = new memwatch.HeapDiff()

// ... run the suspected leaky operation ...
await runAgentSession()

const diff = hd.end()
const growing = diff.change.details
  .filter(d => d.size_bytes > 0)
  .sort((a, b) => b.size_bytes - a.size_bytes)
  .slice(0, 10)

console.table(growing.map(d => ({
  what:   d.what,
  added:  d['+'],
  freed:  d['-'],
  deltaBytes: d.size_bytes,
})))
```

---

## V8 heap snapshot (built-in, no dependency)

```javascript
import v8 from 'v8'
import { writeFileSync } from 'fs'

// Take a heap snapshot — blocks event loop, do offline/on-demand only
function takeHeapSnapshot(path = `/tmp/heap-${Date.now()}.heapsnapshot`): string {
  const snapshot = v8.writeHeapSnapshot(path)
  console.log(`[heap] snapshot written: ${snapshot}`)
  return snapshot
  // Open in Chrome DevTools → Memory tab → Load snapshot
}
```

---

## Simple heap trending (no library)

```javascript
const heapSamples: number[] = []

function sampleHeap(): void {
  const used = process.memoryUsage().heapUsed
  heapSamples.push(used)

  if (heapSamples.length > 10) {
    const trend = heapSamples.slice(-10)
    const growing = trend.every((v, i) => i === 0 || v >= trend[i-1])
    if (growing) {
      const growthMb = (trend.at(-1)! - trend[0]) / 1024**2
      console.warn(`[heap] steady growth: +${growthMb.toFixed(1)}MB over last 10 samples`)
    }
    heapSamples.splice(0, heapSamples.length - 10)
  }
}

setInterval(sampleHeap, 30_000)
```

---

## Common leak patterns to fix

```javascript
// Leak 1: event listener not removed
const handler = () => { /* ... */ }
emitter.on('data', handler)
// Fix:
emitter.once('data', handler)  // or removeListener on cleanup

// Leak 2: setInterval not cleared
const id = setInterval(() => { /* ... */ }, 1000)
// Fix:
process.on('exit', () => clearInterval(id))

// Leak 3: large object in closure
// function factory() { const big = new Array(1e6).fill(0); return () => big[0] }
// Fix: don't capture large objects in long-lived closures
```

---

## Anti-Fake-Pass Checklist

```
❌ heap snapshot in production → blocks event loop for 2-30 seconds
❌ memwatch-next requires native build → fails on ARM without node-gyp
❌ HeapDiff across async boundaries → GC between start and end confuses diff
❌ process.memoryUsage().heapUsed alone → includes GC lag, not true live baseline
❌ No threshold → leak detector fires on normal warmup growth
❌ Listening to 'leak' but not acting → log fills, no remediation
```

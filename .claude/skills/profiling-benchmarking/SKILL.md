---
name: profiling-benchmarking
description: Code profiling and benchmarking laws from 5 repos. Statistical benchmark harnesses, micro-second delta timing, string-processing performance comparison, IOPS throttle monitoring, and bundle size analysis. Sources: bestiejs/benchmark.js, alexhuszagh/rust-benchmarks, sindresorhus/time-span, holepunchto/hypercore, hughsk/disc.
origin: yamtam-engine — synthesized from bestiejs/benchmark.js, alexhuszagh/rust-benchmarks, sindresorhus/time-span, holepunchto/hypercore, hughsk/disc
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.38
---

# /profiling-benchmarking

## When to Use

- Comparing two implementations before declaring one "faster"
- Measuring function execution time to microsecond precision
- Monitoring disk/network IOPS in a data pipeline
- Analyzing bundle size bloat after adding a dependency
- "This feels slow" — mandate measurement before any optimization

## Do NOT use for

- One-shot scripts (profiling overhead exceeds the code itself)
- Claiming performance without evidence — always cite ops/sec or ms

---

## The Golden Rule

```
Measure first. Optimize second. Measure again.
Never claim "faster" without benchmark.js ops/sec or process.hrtime() delta.
Status on any perf claim: REVIEWED (with numbers) or UNKNOWN (without).
```

---

## Statistical Benchmark (benchmark.js)

```javascript
import Benchmark from 'benchmark'

const suite = new Benchmark.Suite('string-ops')

suite
  .add('regex replace', () => {
    'hello world'.replace(/o/g, '0')
  })
  .add('split-join', () => {
    'hello world'.split('o').join('0')
  })
  .on('cycle', e => console.log(String(e.target)))
  .on('complete', function() {
    console.log('Fastest: ' + this.filter('fastest').map('name'))
  })
  .run({ async: false })

// Output: regex replace × 12,450,000 ops/sec ±0.82% (91 runs)
// Rule: run ≥ 5 cycles per benchmark; < 5 cycles = statistically unreliable
// Rule: report ops/sec + margin of error (±%), never raw time alone
```

---

## Microsecond Delta Timing (process.hrtime / time-span)

```javascript
import timeSpan from 'time-span'

// time-span wraps process.hrtime.bigint() — nanosecond resolution
const end = timeSpan()
await expensiveOperation()
const ms = end()           // elapsed milliseconds (float)
const ns = end.nanoseconds()  // raw nanoseconds

console.log(`Operation: ${ms.toFixed(3)}ms`)

// Manual hrtime for environments without time-span
const t0 = process.hrtime.bigint()
doWork()
const elapsed = Number(process.hrtime.bigint() - t0) / 1e6  // → ms
// Never use Date.now() for performance measurement — 1ms resolution only
```

---

## String Processing Benchmark Pattern (rust-benchmarks principle)

```javascript
// Always bench the realistic input, not a toy string
const INPUTS = {
  tiny:   'hello',
  small:  'a'.repeat(100),
  medium: 'a'.repeat(10_000),
  large:  'a'.repeat(1_000_000),
}

// Separate suite per input size — perf can invert across sizes
for (const [label, input] of Object.entries(INPUTS)) {
  new Benchmark.Suite(`split-at-comma [${label}]`)
    .add('regex',      () => input.split(/,/))
    .add('indexOf',    () => splitByIndexOf(input, ','))
    .run()
}

// rust-benchmarks rule: always test empty, small, medium, large — perf
// characteristics differ at each scale (cache effects, branch prediction)
```

---

## IOPS Monitoring (hypercore pattern)

```javascript
// Measure read/write throughput for any async operation
class IOPSMonitor {
  #counts = { read: 0, write: 0 }
  #bytes  = { read: 0, write: 0 }
  #start  = Date.now()

  recordRead(bytes)  { this.#counts.read++;  this.#bytes.read  += bytes }
  recordWrite(bytes) { this.#counts.write++; this.#bytes.write += bytes }

  report() {
    const elapsed = (Date.now() - this.#start) / 1000
    return {
      readIOPS:   (this.#counts.read  / elapsed).toFixed(1),
      writeIOPS:  (this.#counts.write / elapsed).toFixed(1),
      readMBps:   (this.#bytes.read   / elapsed / 1e6).toFixed(2),
      writeMBps:  (this.#bytes.write  / elapsed / 1e6).toFixed(2),
    }
  }
}

// hypercore throttle rule: if writeIOPS > 80% of device limit → back off
// Detect: monitor.report().writeIOPS > DEVICE_LIMIT * 0.8
```

---

## Bundle Size Analysis (disc principle)

```bash
# disc-style: visualize which module contributes what size
npx webpack --json > stats.json
npx webpack-bundle-analyzer stats.json   # interactive treemap

# For Node: measure require cost
node --require ./perf-monitor.js app.js  # hooks require() timing

# Rules (disc guidelines):
# - Any single dep > 100KB (gzipped) needs a justification comment
# - Total app bundle > 500KB (gzipped) → mandatory tree-shake audit
# - Visualize before and after adding any dependency > 20KB

# Quick check: bundlephobia before npm install
# curl https://bundlephobia.com/api/size?package=lodash → { gzip: 24300 }
```

---

## Benchmark Checklist Before Claiming "Fast"

```javascript
// Mandatory fields in any perf PR comment:
const perfReport = {
  what: 'Replace regex vs split-join on 10k-char string',
  before: '2,100,000 ops/sec ±1.2%',
  after:  '3,800,000 ops/sec ±0.9%',
  gain:   '+81%',
  runs:   91,           // ≥ 5 required, ≥ 50 preferred
  node:   process.version,
  cpu:    os.cpus()[0].model,
}
```

---

## Anti-Fake-Pass Checklist

```
❌ "This is faster" claim without ops/sec number — status: UNKNOWN
❌ Benchmark with < 5 runs (statistically meaningless)
❌ Using Date.now() for sub-millisecond timing (1ms resolution)
❌ Benchmarking only the tiny input (cache effects hide large-input behavior)
❌ Bundle size analysis skipped after adding dependency > 20KB
❌ IOPS reported as raw count without elapsed time (not a rate)
❌ Perf test in the same process as other tests (JIT contamination)
```

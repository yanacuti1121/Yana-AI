---
name: high-perf-data-algorithms
description: High-performance data processing patterns from 5 repos. O(n log n) array algorithms, lazy evaluation chains, statistical computation on raw data, streaming JSON parsing for large files, and concurrent async queue management. Sources: d3/d3-array, lodash/lodash, simple-statistics/simple-statistics, vitorperes/json-stream, sindresorhus/p-queue.
origin: yamtam-engine — synthesized from d3/d3-array, lodash/lodash, simple-statistics/simple-statistics, vitorperes/json-stream (jsonstream), sindresorhus/p-queue
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.38
---

# /high-perf-data-algorithms

## When to Use

- Processing arrays of 100k+ items (sort, bin, group, roll-up)
- Chaining multiple transforms without intermediate array allocations
- Computing statistics (mean, stddev, regression) without a heavy lib
- Parsing JSON files > 100MB without loading them into RAM
- Throttling concurrent API calls / DB queries to avoid overload

## Do NOT use for

- Arrays < 1000 items (readability > optimization)
- Streaming non-JSON formats (use line-reader or csv-parse instead)

---

## Array Algorithms (d3-array)

```javascript
import { bin, rollup, group, extent, bisectLeft, sort } from 'd3-array'

// Histogram binning — O(n) after sort
const bins = bin()
  .value(d => d.score)
  .thresholds(20)
  (data)

// Rollup: group + aggregate in one pass — O(n)
const byRegion = rollup(
  sales,
  rows => rows.reduce((s, r) => s + r.revenue, 0),
  d => d.region,
  d => d.quarter,
)
// → Map { 'APAC' → Map { 'Q1' → 4200000, ... } }

// Binary search in sorted array — O(log n)
const idx = bisectLeft(sortedScores, targetScore)
```

---

## Lazy Evaluation Chain (lodash)

```javascript
import _ from 'lodash'

// Eager (bad for large arrays — 3 full passes):
const result = data.filter(isActive).map(toSummary).slice(0, 100)

// Lazy chain (good — stops after collecting 100 results):
const result = _(data)
  .filter(isActive)    // deferred
  .map(toSummary)      // deferred
  .take(100)           // triggers execution, exits early
  .value()

// Rule: lazy chain pays off at > 200 items; under that, native array is faster
// Rule: never call .value() inside a loop — exit the chain first
```

---

## Statistics on Raw Data (simple-statistics)

```javascript
import {
  mean, median, standardDeviation,
  linearRegression, linearRegressionLine,
  quantile, interquartileRange,
} from 'simple-statistics'

const values = [12, 45, 67, 23, 89, 34, 56]

// Descriptive — all O(n) except median which sorts O(n log n)
console.log(mean(values))               // 46.57
console.log(standardDeviation(values))  // 27.3
console.log(quantile(values, 0.75))     // 75th percentile (P75)
console.log(interquartileRange(values)) // IQR = P75 - P25

// Linear regression — O(n)
const pairs = values.map((y, x) => [x, y])
const { m, b } = linearRegression(pairs)
const predict = linearRegressionLine({ m, b })
predict(10)  // extrapolate at x=10
```

---

## Streaming JSON Parser (JSONStream)

```javascript
import JSONStream from 'JSONStream'
import fs from 'fs'

// Parse 1GB JSON file in 512MB RAM — never loads full file
// File: { "users": [ {...}, {...}, ... ] }
fs.createReadStream('data/users-1gb.json')
  .pipe(JSONStream.parse('users.*'))   // stream each user object
  .on('data', user => {
    processUser(user)                  // handle one at a time
  })
  .on('end', () => console.log('done'))

// For newline-delimited JSON (NDJSON): parse each line separately
fs.createReadStream('events.ndjson')
  .pipe(JSONStream.parse())
  .on('data', event => queue.add(() => ingest(event)))
```

---

## Concurrent Async Queue (p-queue)

```javascript
import PQueue from 'p-queue'

// Hard limit: never exceed 5 concurrent API calls
const queue = new PQueue({ concurrency: 5 })

// Throttled rate limit: 10 calls per second
const rateLimited = new PQueue({ concurrency: 10, intervalCap: 10, interval: 1000 })

// Batch 10k items without spawning 10k promises at once
const results = await Promise.all(
  records.map(rec => queue.add(() => fetchEnrichedData(rec)))
)

// Priority queue — urgent tasks jump the line
await queue.add(() => criticalSync(), { priority: 10 })
await queue.add(() => backgroundBackfill(), { priority: 1 })

// Monitor queue health
queue.on('active', () => console.log(`Queue size: ${queue.size}, pending: ${queue.pending}`))
```

---

## Complexity Quick Reference

```
d3 bin()            O(n log n)  — sorts before binning
d3 rollup()         O(n)        — single pass
d3 bisectLeft()     O(log n)    — binary search (array must be sorted)
lodash lazy chain   O(n/k)      — early exit after take(k)
simple-statistics   O(n)        — most; median O(n log n)
JSONStream parse    O(1) space  — streaming, no full parse
p-queue add()       O(1)        — constant enqueue
```

---

## Anti-Fake-Pass Checklist

```
❌ Calling .value() inside a .map() callback (cancels lazy eval)
❌ JSONStream on NDJSON using 'users.*' path (wrong parser for flat streams)
❌ p-queue without concurrency cap (default = Infinity = thundering herd)
❌ mean() on unsorted data expecting sorted output (it's unordered)
❌ Rolling statistics inside a nested loop instead of single-pass rollup
❌ Binary search (bisectLeft) on unsorted array (silently wrong result)
```

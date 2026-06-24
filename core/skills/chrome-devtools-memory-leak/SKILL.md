---
name: chrome-devtools-memory-leak
description: JavaScript/Node.js memory leak debugging via Chrome DevTools MCP. Heap snapshot workflow (baseline→target→final), memlab analysis, common leak patterns (detached DOM, closures, unbounded caches, event listeners). Sources: ChromeDevTools/chrome-devtools-mcp (Apache-2.0).
origin: yana-ai — synthesized from ChromeDevTools/chrome-devtools-mcp (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.55
---

# /chrome-devtools-memory-leak

## When to Use

- Page memory grows over time without releasing (OOM errors, tab crashes)
- Node.js server RSS grows unbounded under load
- Need to identify which objects are growing between interactions
- Investigating detached DOM nodes, retained closures, or unbounded caches

## Do NOT use for

- CPU performance bottlenecks (use [[chrome-devtools-lcp-debug]])
- Network-related slowdowns
- Memory analysis on non-Chromium browsers

---

## Three-snapshot workflow

```
Baseline snapshot   → take before any interaction (clean initial state)
Target snapshot     → take after N repetitions of the suspect interaction
Final snapshot      → take after reverting actions (if memory not released → leak confirmed)

Rule: repeat the interaction 10× to amplify the leak signal before snapshotting.
```

```typescript
// 1. Navigate to page
await mcp.call("navigate_page", { url: "https://app.example.com/page" });
await mcp.call("wait_for", { selector: "[data-loaded]" });

// 2. Baseline snapshot
await mcp.call("take_heapsnapshot", { filePath: "/tmp/baseline.heapsnapshot" });

// 3. Repeat the suspect interaction 10 times to amplify the leak
for (let i = 0; i < 10; i++) {
  await mcp.call("click",    { uid: "open-modal-uid" });
  await mcp.call("wait_for", { selector: ".modal" });
  await mcp.call("click",    { uid: "close-modal-uid" });
  await mcp.call("wait_for", { networkIdle: true });
}

// 4. Target snapshot (after repeated interactions)
await mcp.call("take_heapsnapshot", { filePath: "/tmp/target.heapsnapshot" });

// 5. Revert to initial state
await mcp.call("navigate_page", { url: "https://app.example.com/page" });

// 6. Final snapshot (if memory still high → leak confirmed)
await mcp.call("take_heapsnapshot", { filePath: "/tmp/final.heapsnapshot" });
```

---

## Analyze with memlab (preferred — never read raw .heapsnapshot files)

```bash
# Raw .heapsnapshot files can be hundreds of MB — never cat/read them directly.
# Always use memlab to process and summarize.

npm install -g @memlab/cli

# Find leaks between baseline and target
memlab analyze --baseline /tmp/baseline.heapsnapshot \
               --target   /tmp/target.heapsnapshot   \
               --final    /tmp/final.heapsnapshot

# Output: leak traces with object type, size, and retainer chain
# Example output:
# [MemLab] Leak #1: HTMLDivElement (234 instances, 4.2 MB)
# Retained by: listeners → EventTarget → ... → window
```

---

## Fallback: compare snapshots without memlab

```bash
# If memlab is not available, use heapsnapshot summary tools
await mcp.call("get_heapsnapshot_summary", {
  snapshotFile: "/tmp/target.heapsnapshot"
});
# Returns: top N classes by instance count and retained size

# Drill into a specific class
await mcp.call("get_heapsnapshot_class_nodes", {
  snapshotFile: "/tmp/target.heapsnapshot",
  className: "HTMLDivElement",
  limit: 10,
});

# Find what's retaining a specific node
await mcp.call("get_heapsnapshot_retainers", {
  snapshotFile: "/tmp/target.heapsnapshot",
  nodeId: 12345,
});
```

---

## Common leak patterns and fixes

```javascript
// 1. DETACHED DOM NODES — element removed from DOM but still referenced
// Symptom: memlab shows "Detached HTMLDivElement" growing
// Cause:
const modal = document.createElement('div');
document.body.appendChild(modal);
document.body.removeChild(modal);
// BUG: `modal` variable still holds reference → GC can't collect it

// Fix: null the reference after removal
document.body.removeChild(modal);
modal = null;  // allow GC

// 2. UNBOUNDED EVENT LISTENERS — listeners added but never removed
// Symptom: EventListener count grows on each interaction
// Cause:
function openModal() {
  document.addEventListener('keydown', handleKeyDown);  // BUG: added every open
}
// Fix: track and remove
function openModal()  { document.addEventListener('keydown', handleKeyDown); }
function closeModal() { document.removeEventListener('keydown', handleKeyDown); }

// 3. CLOSURE RETAINING LARGE OBJECTS
// Symptom: closure in memlab trace retaining a large array/DOM subtree
// Cause:
function processData(largeArray) {
  const sum = largeArray.reduce((a, b) => a + b, 0);
  return () => console.log(sum);  // BUG: closure captures largeArray in scope
}
// Fix: extract only what's needed before closure
function processData(largeArray) {
  const sum = largeArray.reduce((a, b) => a + b, 0);
  largeArray = null;              // allow GC before closure is created
  return () => console.log(sum);
}

// 4. UNBOUNDED CACHE — Map/WeakMap growing without eviction
// Symptom: Map instance growing in memlab across interactions
// Cause:
const cache = new Map();
function fetchUser(id: string) {
  if (!cache.has(id)) cache.set(id, fetchFromAPI(id));  // BUG: never evicted
  return cache.get(id);
}
// Fix: LRU with size limit
import LRU from 'lru-cache';
const cache = new LRU({ max: 500, ttl: 1000 * 60 * 5 });
```

---

## Node.js server memory leak workflow

```bash
# For Node.js backend leaks (not browser):
# 1. Expose heap snapshot endpoint
node --inspect app.js

# 2. Trigger snapshot via CDP
curl -X POST http://localhost:9229/json/v1/profiler/takeHeapSnapshot \
  -o /tmp/server-heap.heapsnapshot

# 3. Analyze with memlab
memlab analyze --target /tmp/server-heap.heapsnapshot

# Or use process.memoryUsage() to confirm leak exists first:
setInterval(() => {
  const { heapUsed, rss } = process.memoryUsage();
  console.log(`heap: ${(heapUsed/1e6).toFixed(1)}MB  rss: ${(rss/1e6).toFixed(1)}MB`);
}, 5000);
```

---

## Anti-Fake-Pass Checklist

```
❌ Reading raw .heapsnapshot file directly → files are 100–500 MB; will exhaust token budget
❌ Single snapshot without baseline → no delta = no leak evidence
❌ Fewer than 10 repetitions → small leak signal is noise; amplify to 10x first
❌ Nulling detached DOM without confirming it's not an intentional cache → ask user first
❌ Fixing closure without profiling first → premature optimization; confirm with memlab trace
❌ Assuming OOM = memory leak → could be unbounded legitimate data growth; measure first
```

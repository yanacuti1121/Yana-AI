---
name: chrome-devtools-lcp-debug
description: LCP (Largest Contentful Paint) debugging and optimization via Chrome DevTools MCP. Four subparts (TTFB/load-delay/load-duration/render-delay), performance trace workflow, insight analysis, optimization checklist. Good LCP ≤2.5s. Sources: ChromeDevTools/chrome-devtools-mcp (Apache-2.0).
origin: yana-ai — synthesized from ChromeDevTools/chrome-devtools-mcp (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.55
---

# /chrome-devtools-lcp-debug

## When to Use

- Page feels slow to load / Core Web Vitals failing (LCP > 2.5s)
- Hero image or main content takes too long to appear
- Need to identify which LCP subpart is the bottleneck before optimizing
- CrUX field data shows real-user LCP regression

## Do NOT use for

- JavaScript runtime performance (use CPU profiler)
- Memory leaks (use [[chrome-devtools-memory-leak]])
- Accessibility issues (use [[chrome-devtools-a11y-audit]])

---

## LCP thresholds

```
≤ 2.5s  Good
2.5–4s  Needs improvement
> 4s    Poor
73% of mobile pages: LCP element is an image.
```

---

## Four LCP subparts (no gaps, no overlaps)

```
┌───────────────────────────────────────────────────────────────────┐
│ TTFB          │ Load delay │ Load duration    │ Render delay │
│ (~40% of LCP) │ (<10%)     │ (~40% of LCP)    │ (<10%)       │
└───────────────────────────────────────────────────────────────────┘

TTFB             — navigation start → first byte of HTML received
Load delay       — TTFB → browser starts loading LCP resource  ← minimize
Load duration    — time to download the LCP resource
Render delay     — LCP resource downloaded → LCP element rendered ← minimize

"Delay" subparts should be near zero. A large delay = first optimization target.

⚠️ Common mistake: compress the LCP image (reduces load-duration) when render-delay
   is the actual bottleneck → saved time just shifts to render-delay, no real gain.
   ALWAYS check all four subparts first.
```

---

## Step 1: Record performance trace

```typescript
// Navigate first, then record with reload to capture full page load
await mcp.call("navigate_page", { url: "https://example.com" });

const traceResult = await mcp.call("performance_start_trace", {
  reload: true,      // reload the page during trace to capture load events
  autoStop: true,    // stop automatically when page load is complete
});
// traceResult contains: { insightSets: [{ id: "abc123", name: "..." }] }
const insightSetId = traceResult.insightSets[0].id;
```

---

## Step 2: Analyze LCP insights

```typescript
// Drill into each relevant insight by name
const insightNames = ["LCPBreakdown", "DocumentLatency", "RenderBlocking", "LCPDiscovery"];

for (const insightName of insightNames) {
  const insight = await mcp.call("performance_analyze_insight", {
    insightSetId,
    insightName,
  });
  console.log(`${insightName}:`, insight);
}

// LCPBreakdown → four subpart timings (TTFB, load-delay, load-duration, render-delay)
// DocumentLatency → server response time (high TTFB)
// RenderBlocking → resources blocking the LCP element from rendering
// LCPDiscovery → was the LCP resource in the initial HTML or discovered late?
```

---

## Step 3: Identify LCP element

```typescript
// Use evaluate_script to find the exact LCP element
const lcpData = await mcp.call("evaluate_script", {
  script: `
    new Promise(resolve => {
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        resolve({
          element:  last.element?.tagName,
          url:      last.url,
          size:     last.size,
          startTime: last.startTime,
          renderTime: last.renderTime || last.loadTime,
        });
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    })
  `
});
// url field → find this resource in the network waterfall
// If url is empty → LCP element is text (no resource to optimize)
```

---

## Optimization by bottleneck

```
Subpart          Bottleneck signal             Fix
───────────────  ────────────────────────────  ────────────────────────────────────
TTFB (>1s)       DocumentLatency insight high  CDN, server-side caching, edge compute
Load delay       LCPDiscovery late             Add <link rel="preload"> for LCP image
Load duration    LCP image download slow       Compress image (WebP/AVIF), use CDN, resize
Render delay     RenderBlocking insight        Remove/defer render-blocking CSS/JS

Preload pattern (fixes load delay):
<link rel="preload" as="image" href="/hero.webp" fetchpriority="high">

fetchpriority="high" on the LCP <img>:
<img src="/hero.webp" fetchpriority="high" alt="Hero">
```

---

## Quick size audit

```typescript
// Check LCP image dimensions vs display size (over-sized images)
const imageAudit = await mcp.call("evaluate_script", {
  script: `
    const img = document.querySelector('[fetchpriority="high"], img:first-of-type');
    if (!img) return null;
    return {
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      displayW: img.offsetWidth,
      displayH: img.offsetHeight,
      src: img.src,
      waste: ((img.naturalWidth * img.naturalHeight) / (img.offsetWidth * img.offsetHeight)).toFixed(1) + 'x oversize'
    };
  `
});
```

---

## Full trace to file (production)

```typescript
// For deep analysis: save full trace to file
await mcp.call("performance_start_trace", {
  filePath: "/tmp/lcp-trace.json",
  reload: true,
  autoStop: true,
});
// Analyze offline with Chrome DevTools → Performance panel → Load trace file
```

---

## Anti-Fake-Pass Checklist

```
❌ Optimizing load-duration when render-delay is the bottleneck → saved time shifts, no real gain
❌ No preload for LCP image → browser discovers it late → high load delay
❌ LCP image without fetchpriority="high" → browser treats it as low-priority → high load delay
❌ Compressing image without checking display size first → may still be 10x oversized
❌ Only checking lab data (traces) — always cross-check with CrUX field data for real-user impact
❌ Recording trace without reload: true → misses TTFB and resource load events
```

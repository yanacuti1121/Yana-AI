---
name: web-performance
description: >
  Audit and optimize web performance — Core Web Vitals (LCP, INP, CLS),
  bundle splitting, lazy loading, image optimization, caching strategies,
  and resource hints. Use when asked to "improve performance", "fix LCP/CLS/INP",
  "optimize bundle", "reduce load time", "lazy load images", "add caching",
  or before marking any public-facing page as production-ready.
  Do NOT use for server-side database performance — this covers frontend and
  network-layer only.
origin: adapted:secondsky/claude-skills
license: MIT © 2025 Claude Skills Maintainers
version: 1.0.0
compatibility: "Any web frontend. Framework-agnostic patterns + Webpack/Vite/Rollup examples."
---

<!-- Adapted from secondsky/claude-skills (MIT) — web-performance-optimization and
     web-performance-audit skills. Core Web Vitals targets, audit process, optimization
     timeline. YAMTAM structure, per-metric diagnosis tables, and Anti-Fake-Pass are original. -->

## When to Use

- Use when: Lighthouse score < 70 on mobile or desktop
- Use when: LCP > 2.5s, INP > 200ms, or CLS > 0.1
- Use when: bundle size review before shipping new dependencies
- Use when: images are unoptimized or causing layout shift
- Do NOT use for: database query optimization — that's a backend concern
- Do NOT use for: React rendering performance (memo, useMemo) — that's a separate profiling task

---

## Core Web Vitals — Targets and Causes

### LCP — Largest Contentful Paint (target: < 2.5s)

What causes LCP to fail:
| Cause | Fix |
|---|---|
| Render-blocking CSS/JS | `<link rel="preload">` critical CSS; defer non-critical JS |
| Unoptimized hero image | WebP/AVIF + `srcset` + `fetchpriority="high"` on LCP image |
| Slow server response (TTFB > 600ms) | CDN, edge caching, server-side rendering |
| Lazy-loaded LCP element | Remove `loading="lazy"` from the above-fold image |
| Web font blocking render | `font-display: swap` + preload critical font file |

### INP — Interaction to Next Paint (target: < 200ms)
*Replaced FID as Core Web Vital in March 2024 — measure this, not FID.*

What causes INP to fail:
| Cause | Fix |
|---|---|
| Long event handlers (> 50ms) | Break into smaller tasks with `scheduler.yield()` / `setTimeout(0)` |
| Heavy JS on main thread | Move to Web Worker or defer until after interaction |
| Forced synchronous layout | Batch DOM reads/writes; avoid read-then-write patterns |
| Third-party scripts blocking | Load third-party scripts with `async`/`defer`, or lazy-load |

### CLS — Cumulative Layout Shift (target: < 0.1)

What causes CLS to fail:
| Cause | Fix |
|---|---|
| Images without dimensions | Always set `width` + `height` on `<img>`, or use `aspect-ratio` in CSS |
| Web fonts causing FOUT | `font-display: optional` or reserve space with `size-adjust` |
| Dynamic content inserted above existing | Reserve space with `min-height` before content loads |
| Ads / embeds without dimensions | Fixed-size containers for ad slots |

---

## Bundle Optimization

### Code splitting
```js
// Route-level splitting (React)
const Dashboard = lazy(() => import('./Dashboard'));
const Settings  = lazy(() => import('./Settings'));

// Wrap in Suspense with skeleton fallback
<Suspense fallback={<DashboardSkeleton />}>
  <Dashboard />
</Suspense>
```

### Webpack / Vite vendor chunk split
```js
// vite.config.js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['react', 'react-dom'],
        charts:  ['recharts'],
      }
    }
  }
}
```

### Tree shaking — what breaks it
- `import * as X from 'lib'` — prevents tree shaking; use named imports
- CommonJS `require()` — not tree-shakeable; prefer ESM
- Side-effectful imports — mark packages as `"sideEffects": false` in package.json

### Bundle analysis
```bash
# Vite
npx vite-bundle-analyzer
# Webpack
npx webpack-bundle-analyzer stats.json
```

---

## Image Optimization

```html
<!-- Modern format with fallback -->
<picture>
  <source srcset="hero.avif" type="image/avif">
  <source srcset="hero.webp"  type="image/webp">
  <img src="hero.jpg"
       width="1200" height="630"
       alt="..."
       fetchpriority="high"   <!-- LCP image only -->
       decoding="async">
</picture>

<!-- Below-fold images: lazy load -->
<img src="card.webp" loading="lazy" decoding="async" width="400" height="300" alt="...">
```

Rules:
- **LCP image**: never `loading="lazy"`, always `fetchpriority="high"`
- **Every `<img>`**: always set `width` + `height` to prevent CLS
- Prefer AVIF > WebP > JPEG for photos; SVG for icons/illustrations
- Responsive `srcset`: provide 1×, 1.5×, 2× versions

---

## Caching Strategies

### HTTP cache headers
```
# Immutable assets (hashed filenames) — cache forever
Cache-Control: public, max-age=31536000, immutable

# HTML — always revalidate
Cache-Control: no-cache

# API responses — short cache
Cache-Control: public, max-age=60, stale-while-revalidate=300
```

### Service Worker (cache-first for assets, network-first for API)
```js
// Cache-first for static assets
self.addEventListener('fetch', (e) => {
  if (e.request.destination === 'image' || e.request.url.includes('/assets/')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
```

---

## Resource Hints

```html
<!-- DNS + TLS early for external origins -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://cdn.example.com" crossorigin>

<!-- Preload critical resources (LCP image, key font) -->
<link rel="preload" href="/fonts/inter-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/hero.avif" as="image">

<!-- Prefetch next-page resources (low priority, idle time) -->
<link rel="prefetch" href="/dashboard-chunk.js">
```

---

## Optimization Priority

| Effort | Actions |
|---|---|
| Quick (1–2 days) | Enable gzip/Brotli, defer non-critical JS, add image `width`/`height`, `font-display: swap` |
| Medium (1–2 weeks) | Route-level code splitting, service worker, WebP/AVIF conversion, preconnect hints |
| Long-term (1–3 months) | CDN, edge rendering, architecture refactor, performance budget enforcement |

---

## Measurement

```bash
# Lighthouse CLI
npx lighthouse https://yoursite.com --output=html --view

# Field data (web-vitals library in production)
import {onLCP, onINP, onCLS} from 'web-vitals';
onLCP(console.log);
onINP(console.log);
onCLS(console.log);
```

**Always test on throttled mobile** (Lighthouse preset: Moto G4, slow 4G).
Desktop scores mislead — real users are on slower devices.

---

## Anti-Fake-Pass Rules

Before claiming performance is optimized, you MUST show:
- [ ] LCP, INP, CLS — all three measured (Lighthouse score or field data)
- [ ] Every `<img>` has `width` + `height` set (CLS prevention)
- [ ] LCP image: no `loading="lazy"`, has `fetchpriority="high"`
- [ ] Bundle: at least route-level code splitting present
- [ ] Caching headers defined for static assets and HTML separately
- [ ] Tested on throttled mobile, not just desktop

Reference: `gates/anti-fake-pass-gate.md`

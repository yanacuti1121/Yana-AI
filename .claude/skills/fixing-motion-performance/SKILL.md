---
name: fixing-motion-performance
description: >
  Fix animation jank and layout thrashing — compositor-only properties,
  will-change hints, avoiding layout-triggering CSS, GPU layer promotion,
  requestAnimationFrame usage, reduced-motion support, and auditing with
  DevTools Performance panel. Use when asked to "animation is janky",
  "fix animation performance", "layout thrashing", "GPU acceleration",
  "will-change", "compositor layer", "60fps animations", "CSS animation
  vs JS animation", "prefers-reduced-motion", "scroll performance", or
  "why is my transition slow". Do NOT use for: accessibility of motion —
  see fixing-accessibility. Do NOT use for: designing animation curves
  and timing — see motion-design.
origin: adapted:MIT © Ibelick
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "All browsers. Framer Motion v11, GSAP v3 specific sections noted."
---

## When to Use

- Use when: animations drop below 60fps or feel "sticky"
- Use when: scrolling is janky on mobile
- Use when: DevTools shows long paint/layout frames during animation
- Use when: CSS transitions animate `width`, `height`, `top`, `left` (causes layout)
- Do NOT use for: choosing easing curves — that's motion-design
- Do NOT use for: reduced-motion accessibility only — see fixing-accessibility

---

## The Two Layers

```
Main thread          Compositor thread
───────────────      ─────────────────────────────────────────
Layout               transform: translate / scale / rotate
Paint                opacity
JavaScript           filter (some)
                     (runs on GPU — never blocks main thread)

Animating non-compositor properties → forces main thread work → jank
```

**Rule: animate ONLY `transform` and `opacity` for 60fps.**

---

## Compositor-Only Animations (Fast)

```css
/* ✅ Fast — runs on compositor, never touches layout */
.box {
  transition: transform 300ms ease, opacity 200ms ease;
}
.box:hover {
  transform: translateY(-4px) scale(1.02);
  opacity: 0.9;
}

/* ✅ Move with transform, not top/left */
.modal-enter { transform: translateY(20px); opacity: 0; }
.modal-open  { transform: translateY(0);    opacity: 1; }
```

---

## Layout-Triggering Properties (Slow)

```css
/* ❌ These trigger layout on every frame — avoid in animations */
.bad-animation {
  transition: width 300ms, height 300ms, top 300ms, left 300ms,
              margin 300ms, padding 300ms, font-size 300ms,
              border-width 300ms;
}

/* ✅ Replace with equivalent compositor animations */
/* Instead of width 0→100%: */
.reveal { transform: scaleX(0); transform-origin: left; }
.reveal.open { transform: scaleX(1); }

/* Instead of height auto: */
/* Use max-height trick or CSS Grid row expansion */
.collapsible { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 300ms; }
.collapsible.open { grid-template-rows: 1fr; }
.collapsible > div { overflow: hidden; }
```

---

## will-change — Use Sparingly

```css
/* ✅ Only on elements that WILL animate, applied just before animation starts */
.card:hover {
  will-change: transform;   /* promote to own GPU layer before hover animates */
}

/* ❌ Don't apply globally — every will-change uses GPU memory */
* { will-change: transform; }  /* exhausts GPU memory */
.static-element { will-change: transform; }  /* no benefit, wastes memory */

/* Remove after animation completes if applied dynamically */
element.addEventListener('transitionend', () => {
  element.style.willChange = 'auto';
});
```

---

## Scroll Performance

```css
/* Prevent scroll-linked animations from blocking — use passive listeners */
/* In CSS: prevent scrolling from triggering paint */
.scroll-container {
  overflow-y: auto;
  overscroll-behavior: contain;   /* prevents scroll chaining */
  -webkit-overflow-scrolling: touch;
}

/* For sticky headers: use position:sticky (compositor) not scroll JS */
.header { position: sticky; top: 0; }
```

```js
// ❌ Blocking scroll handler
window.addEventListener('scroll', onScroll);

// ✅ Passive — can't call preventDefault, runs on compositor thread
window.addEventListener('scroll', onScroll, { passive: true });
```

---

## requestAnimationFrame

```js
// ❌ setTimeout-based animation — fires off-cadence, causes jank
let pos = 0;
function animate() {
  pos += 2;
  el.style.transform = `translateX(${pos}px)`;
  setTimeout(animate, 16);   // not synced with display refresh
}

// ✅ rAF — fires in sync with browser paint cycle
function animate() {
  pos += 2;
  el.style.transform = `translateX(${pos}px)`;
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
```

---

## Framer Motion — Avoiding Layout Animation Cost

```tsx
import { motion, LayoutGroup } from 'framer-motion';

// ❌ layout prop without LayoutGroup causes full-page layout measurement
<motion.div layout>

// ✅ Scope layout animations with LayoutGroup — limits measurement area
<LayoutGroup>
  <motion.div layout>
    {items.map(i => <motion.div key={i.id} layout />)}
  </motion.div>
</LayoutGroup>

// For list reordering, use layoutId for shared element transitions
<motion.div layoutId={`card-${id}`} />
```

---

## prefers-reduced-motion

```css
/* Always respect user system preference */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

```tsx
// In JS/React
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration = prefersReduced ? 0 : 300;
```

---

## DevTools Audit

```
Chrome DevTools → Performance tab:
  1. Record 3–5s while animation plays
  2. Look at "Frames" row — red = dropped frame (< 60fps)
  3. Expand frame → look for "Layout" or "Paint" tasks during animation
  4. "Rendering" panel → enable "Paint flashing" — green overlay = repaint
  5. "Layers" panel — each will-change element should be its own layer

Target: all animation frames < 16ms (60fps) on mid-range mobile
```

---

## Anti-Fake-Pass Rules

Before claiming animation performance is fixed, you MUST show:
- [ ] All animated properties are `transform` or `opacity` — no `width/height/top/left`
- [ ] `will-change` used only on actually-animated elements, not globally
- [ ] Scroll handlers use `{ passive: true }` option
- [ ] JS animations use `requestAnimationFrame`, not `setTimeout`
- [ ] `prefers-reduced-motion` media query applied globally
- [ ] No layout-triggering properties in `transition:` declarations
- [ ] DevTools Performance shows no dropped frames during animation (or documented acceptable tradeoff)

Reference: `gates/anti-fake-pass-gate.md`

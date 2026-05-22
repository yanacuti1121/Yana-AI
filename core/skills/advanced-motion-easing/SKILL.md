---
name: advanced-motion-easing
description: Production-grade motion engineering from 20 repos. Spring physics, custom easing curves, GPU compositing rules, scroll-driven animations, micro-interactions, Lottie integration, reduced-motion, and stagger choreography. Sources: framer/motion, pmndrs/react-spring, popmotion, animejs, GSAP, auto-animate, @formkit/drag-and-drop, lottie-web, use-gesture, motion-canvas, react-transition-group, swiper, embla-carousel, scrollreveal, lax.js, use-spring, react-use-gesture, theatre.js, rive-app/rive-wasm, css-spring-easing.
origin: yamtam-engine — synthesized from framer/motion, pmndrs/react-spring, popmotion/popmotion, juliangarnier/anime, greensock/gsap, formkit/auto-animate, formkit/drag-and-drop, airbnb/lottie-web, pmndrs/use-gesture, motion-canvas/motion-canvas, reactjs/react-transition-group, nolimits4web/swiper, davidcetinkaya/embla-carousel, jlmakes/scrollreveal, alexfoxy/lax.js, nicowillis/use-spring, pmndrs/react-use-gesture, ArthurHub/theatre, rive-app/rive-wasm, nicowillis/css-spring-easing
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.37
---

# /advanced-motion-easing

## When to Use

- Implementing spring-based UI transitions (not CSS ease-in-out)
- Building drag-and-drop with inertia
- Scroll-driven animations that feel native
- Choreographing staggered list entrances
- Integrating Lottie / Rive animations with code control

## Do NOT use for

- Static pages with no interaction
- Transitions < 150ms (imperceptible — skip animation entirely)

---

## Spring Config Reference (framer/motion + react-spring)

```javascript
// Named presets — use these before custom tuning
const springs = {
  snappy:  { stiffness: 400, damping: 30, mass: 1 },   // UI micro
  default: { stiffness: 260, damping: 25, mass: 1 },   // standard nav
  gentle:  { stiffness: 120, damping: 20, mass: 1 },   // modals, panels
  wobbly:  { stiffness: 180, damping: 12, mass: 1 },   // playful UIs
  slow:    { stiffness: 60,  damping: 15, mass: 1 },   // hero reveals
}

// framer-motion usage
<motion.div animate={{ y: 0 }} transition={springs.snappy} />

// react-spring usage
const { y } = useSpring({ y: 0, config: springs.gentle })
```

---

## Custom Easing Curves (css-spring-easing + GSAP)

```javascript
// css-spring-easing — generates linear() from spring params
import { createEasing } from 'css-spring-easing'

const [easing, duration] = createEasing({ stiffness: 260, damping: 25 })
// → "linear(0, 0.012, 0.044...)" — native CSS, no JS runtime

element.animate({ transform: ['translateY(20px)', 'translateY(0)'] }, {
  duration,
  easing,
  fill: 'both',
})
```

---

## GPU Compositing Rules (framer/motion + GSAP guidelines)

```
✅ Animate: transform (translate, scale, rotate), opacity
✅ Use will-change: transform sparingly — only during animation
✅ Use translateZ(0) or translate3d to force GPU layer

❌ Never animate: width, height, top, left, margin, padding
   → triggers layout reflow on every frame

❌ Never animate: background-color, box-shadow
   → triggers paint; use opacity + pseudo-element trick instead

// Correct shadow animation
.card::after {
  opacity: 0;
  box-shadow: 0 8px 24px rgba(0,0,0,.2);
  transition: opacity 200ms;
}
.card:hover::after { opacity: 1; }
```

---

## Scroll-Driven Animations (CSS native)

```css
/* CSS Scroll-driven (Chrome 115+) — zero JS */
@keyframes reveal {
  from { opacity: 0; translate: 0 40px; }
  to   { opacity: 1; translate: 0 0; }
}

.card {
  animation: reveal linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 40%;
}

/* Sticky progress bar */
#progress {
  position: fixed;
  transform-origin: left;
  animation: grow linear;
  animation-timeline: scroll(root block);
}
@keyframes grow { to { transform: scaleX(1); } }
```

---

## Stagger Choreography (anime.js)

```javascript
import anime from 'animejs'

// Max stagger total = 400ms (beyond that feels broken)
anime({
  targets: '.list-item',
  opacity:   [0, 1],
  translateY: [16, 0],
  easing:   'spring(1, 80, 10, 0)',
  delay:    anime.stagger(50, { start: 0 }),  // 50ms × n items
  duration: 350,
})
// 8 items × 50ms = 400ms — at limit; more items → reduce delay

// Rule: (n_items × stagger_ms) + duration ≤ 800ms total
```

---

## Lottie Integration (lottie-web)

```javascript
import lottie from 'lottie-web'

const anim = lottie.loadAnimation({
  container: document.getElementById('lottie'),
  renderer: 'svg',       // SVG for quality; canvas for 60fps perf
  loop: false,
  autoplay: false,
  path: '/animations/success.json',
})

// Control from code (theatre.js pattern)
anim.addEventListener('DOMLoaded', () => {
  anim.goToAndStop(0, true)   // start at frame 0
})

function playOnHover() { anim.play() }
function reset()       { anim.goToAndStop(0, true) }
```

---

## Reduced-Motion (mandatory — framer/motion hook)

```javascript
import { useReducedMotion } from 'framer-motion'

function AnimatedCard() {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : springs.default}
    />
  )
}

// CSS fallback (always include both)
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Anti-Fake-Pass Checklist

```
❌ Animating width/height/top/left (layout thrash)
❌ Stagger total > 800ms (items beyond 8 at 50ms stagger)
❌ will-change: transform left on permanently (memory leak)
❌ No prefers-reduced-motion guard
❌ Lottie using canvas renderer for < 60fps SVG-quality use case
❌ CSS transition on box-shadow (use opacity + ::after trick)
❌ Spring damping < 10 (infinite oscillation)
```

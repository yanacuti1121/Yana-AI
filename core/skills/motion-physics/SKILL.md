---
name: motion-physics
description: Physics-based UI animation system. Spring physics, easing curves, micro-interaction patterns, and timeline staggering for native-quality web animations. Sources: popmotion, framer/motion, anime.js, greensock, argyleink/transition.css, and 5 others.
origin: yana-ai — synthesized from popmotion/popmotion, joshwcomeau/css-animations, the-creative-momentum/creative-motions, animate-css/animate.css, juliangarnier/anime, argyleink/transition.css, greenbadge/motion-spec, lottiefiles/lottie-web, delightful-ui/micro-effects, bameyrick/react-spring
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.35
---

# /motion-physics

## When to Use

- UI transitions that feel mechanical or abrupt
- Micro-interactions (button press, toggle, checkbox)
- Page transitions and route animations
- Loading states that need to feel alive

## Do NOT use for

- Animations that run for > 5s (use video/Lottie)
- Purely decorative background animations with no functional meaning
- Reduced-motion users (always check `prefers-reduced-motion`)

---

## The Physics Model (popmotion + react-spring)

Real-world objects have **mass**, **tension**, and **friction**.
Spring physics produces motion that feels natural because it mirrors reality.

```javascript
// Spring config presets
const springs = {
  snappy:  { mass: 1, tension: 300, friction: 20 },  // button presses
  gentle:  { mass: 1, tension: 120, friction: 14 },  // page transitions
  wobbly:  { mass: 1, tension: 180, friction: 12 },  // playful toasts
  stiff:   { mass: 1, tension: 400, friction: 26 },  // data updates
}

// react-spring usage
import { useSpring, animated } from '@react-spring/web'
const props = useSpring({ opacity: visible ? 1 : 0, config: springs.gentle })
```

---

## Duration Rules (greenbadge/motion-spec)

Duration MUST scale with the physical distance traveled:

```
Micro interactions (< 4px move):   100–150ms
Small components (4–100px):        150–250ms
Large panels / modals (> 100px):   250–400ms
Page-level transitions:            300–500ms
```

**Hard limits:**
- Nothing interactive > 500ms (users perceive as slow)
- Nothing decorative that blocks interaction
- Entrance: faster than exit (snappy in, graceful out)

---

## Easing Curves (argyleink/transition.css)

```css
:root {
  --ease-in:      cubic-bezier(0.4, 0, 1, 1);
  --ease-out:     cubic-bezier(0, 0, 0.6, 1);     /* most common — exits */
  --ease-in-out:  cubic-bezier(0.4, 0, 0.2, 1);   /* page transitions */
  --ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1); /* overshoot */
  --ease-bounce:  cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

/* Rule: entrances use ease-out, exits use ease-in */
.enter { animation: fade-in 200ms var(--ease-out) forwards; }
.exit  { animation: fade-out 150ms var(--ease-in) forwards; }
```

---

## Micro-Interaction Patterns (delightful-ui)

```css
/* Button press — scale down on active */
.button {
  transition: transform 100ms var(--ease-spring),
              box-shadow 100ms var(--ease-out);
}
.button:active {
  transform: scale(0.97);
  box-shadow: var(--elevation-1);
}

/* Toggle switch snap */
.toggle-thumb {
  transition: transform 200ms var(--ease-spring);
}
.toggle:checked .toggle-thumb { transform: translateX(20px); }

/* Ripple effect on click */
@keyframes ripple {
  from { transform: scale(0); opacity: 0.4; }
  to   { transform: scale(4); opacity: 0; }
}
```

---

## Staggered List Animations (anime.js pattern)

```javascript
import anime from 'animejs'

// Stagger children with delay based on index
anime({
  targets: '.list-item',
  opacity: [0, 1],
  translateY: [20, 0],
  easing: 'easeOutExpo',
  duration: 300,
  delay: anime.stagger(50, { start: 100 })  // 50ms between each
})
```

**Rule:** Stagger delay must be proportional — longer lists = smaller delay per item.
Max total stagger time = 400ms regardless of list length.

---

## Lottie for Complex Animations

```javascript
import lottie from 'lottie-web'

const anim = lottie.loadAnimation({
  container: document.getElementById('lottie'),
  renderer: 'svg',           // SVG for UI, canvas for many instances
  loop: false,
  autoplay: true,
  path: '/animations/success.json'
})
// Control playback
anim.setSpeed(1.5)   // 1.5x speed for perceived snappiness
```

Use Lottie for: empty states, success/error illustrations, loading indicators.

---

## Reduced Motion (mandatory)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

This override MUST be present in every project using animations.

---

## Anti-Pattern Checklist

```
❌ Linear easing on any UI animation (always use curve)
❌ Duration > 500ms on interactive elements
❌ Entrance and exit using same easing (should be mirrored)
❌ Animating width/height directly (use transform: scaleX/scaleY)
❌ Missing prefers-reduced-motion media query
❌ Stagger total duration > 400ms
❌ Animating box-shadow directly (use opacity on pseudo-element)
```

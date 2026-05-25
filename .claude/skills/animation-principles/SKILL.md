---
name: animation-principles
description: >
  Apply Disney's 12 animation principles to web and app interfaces —
  squash-and-stretch, anticipation, staging, follow-through, slow-in/slow-out,
  arcs, secondary action, timing, exaggeration, solid form, straight-ahead
  vs pose-to-pose, and appeal. Use when asked about "animation principles",
  "12 principles of animation", "Disney animation", "squash and stretch",
  "anticipation in UI", "follow through animation", "animation feels lifeless",
  "make animation feel natural", "physics-based animation", or "why does
  my animation feel robotic". Do NOT use for: animation performance fixes
  — see fixing-motion-performance. Do NOT use for: easing curves and
  duration — see motion-design.
origin: adapted:MIT © raphaelsalaja
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "CSS animations, Framer Motion v11, GSAP v3. Principles are tool-agnostic."
---

## When to Use

- Use when: an animation exists but feels mechanical or lifeless
- Use when: a UI element needs to communicate weight, speed, or emotion
- Use when: building onboarding flows, success states, or playful micro-interactions
- Do NOT use for: performance problems — see fixing-motion-performance
- Do NOT use for: easing function selection — see motion-design

---

## The 12 Principles Applied to Web

### 1. Squash and Stretch — Conveys weight and elasticity

```tsx
// A button press feels "squishy" — like it has mass
<motion.button
  whileTap={{ scaleX: 1.15, scaleY: 0.85 }}   // squash horizontally
  transition={{ type: 'spring', stiffness: 600, damping: 15 }}
>
  Submit
</motion.button>
```

---

### 2. Anticipation — Prepares viewer for action

```tsx
// Card "winds up" before launching — feels deliberate, not sudden
<motion.div
  whileHover={{ y: -2 }}           // tiny upward movement prepares for lift
  whileTap={{ y: 2, scale: 0.98 }} // press down before release
  transition={{ duration: 0.1 }}
/>
```

---

### 3. Staging — Draw attention to what matters

```css
/* Stagger children so eye knows where to look first */
.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 60ms; }
.list-item:nth-child(3) { animation-delay: 120ms; }
```

```tsx
// Framer Motion stagger
const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

<motion.ul variants={container} initial="hidden" animate="show">
  {items.map(i => <motion.li key={i.id} variants={item} />)}
</motion.ul>
```

---

### 4. Slow In / Slow Out (Ease In-Out) — Natural deceleration

```css
/* Physical objects don't move at constant speed */
/* ❌ Linear — robotic */
transition: transform 300ms linear;

/* ✅ Ease-in-out — object accelerates, then decelerates */
transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);  /* Material ease */

/* For spring: objects overshoot slightly, then settle */
/* Framer Motion spring defaults: stiffness 100, damping 10 */
```

---

### 5. Follow Through & Overlapping Action — Parts settle at different times

```tsx
// Modal header settles first, content fades in slightly after
const modal = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  show: {
    opacity: 1, scale: 1, y: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
  }
};
const content = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { delay: 0.1, duration: 0.15 } }
};
```

---

### 6. Arcs — Movement along curved paths feels natural

```tsx
// Move along arc instead of straight line
<motion.div
  animate={{ x: 100, y: -50 }}
  transition={{
    x: { duration: 0.4 },
    y: { duration: 0.2, repeat: 1, repeatType: 'reverse' }  // arc up then down
  }}
/>
```

---

### 7. Secondary Action — Supporting motions add life

```tsx
// Icon rotates as card flips open — secondary action enriches primary
<motion.div animate={{ rotateY: isOpen ? 180 : 0 }}>
  <motion.span
    animate={{ rotate: isOpen ? 180 : 0 }}  // icon follows, but independently
    transition={{ delay: 0.05 }}
  >
    ▾
  </motion.span>
</motion.div>
```

---

### 8. Timing — Duration communicates weight

```
< 100ms   : instant — system response, toggle switch
100–200ms : fast — micro-interactions, hover, button press
200–400ms : medium — modal open, page transition, drawer
400–700ms : slow — hero entrance, celebration, loading complete
> 700ms   : deliberate — onboarding, empty state, first-load reveal

Heavier objects move slower. Lighter objects move faster.
```

---

### 9. Exaggeration — Amplify to clarify

```tsx
// Shake animation for form error — exaggerated, unmistakable
const shake = {
  x: [0, -8, 8, -8, 8, -4, 4, 0],
  transition: { duration: 0.4, ease: 'easeInOut' }
};

<motion.form animate={hasError ? shake : {}} />
```

---

### 10. Appeal — Give elements personality

```tsx
// Loading spinner has personality — not just rotation
<motion.div
  animate={{ rotate: 360 }}
  transition={{
    repeat: Infinity,
    duration: 1,
    ease: [0.4, 0, 0.6, 1]   // ease-in-out-cubic: hesitates at start/end
  }}
/>
```

---

### 11. Solid Drawing — Maintain spatial consistency

```tsx
// Elements know where they live in 3D space
<motion.div
  initial={{ rotateX: -10, opacity: 0 }}
  animate={{ rotateX: 0, opacity: 1 }}
  style={{ transformPerspective: 800 }}  // establishes 3D space
/>
```

---

### 12. Straight Ahead vs Pose-to-Pose

```
Straight ahead = animate frame-by-frame (CSS keyframes, complex JS paths)
Pose-to-pose   = define start + end state, let engine interpolate (Framer Motion, GSAP)

Web UI default: use pose-to-pose. Straight ahead only for complex paths (GSAP MotionPath).
```

---

## Anti-Fake-Pass Rules

Before claiming animation feels natural, you MUST show:
- [ ] No linear easing on UI transitions — use ease-in-out or spring
- [ ] Heavy elements (modals, drawers) have longer duration than light ones (tooltips)
- [ ] List items stagger — not all appear simultaneously
- [ ] Errors/warnings use exaggeration (shake, pulse) to be unmistakable
- [ ] All animations respect `prefers-reduced-motion`
- [ ] No animation > 500ms for routine interactions (reserve for celebration states)

Reference: `gates/anti-fake-pass-gate.md`

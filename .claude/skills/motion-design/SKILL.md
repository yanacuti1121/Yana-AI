---
name: motion-design
description: >
  Design motion and animation for UI — duration timing, easing curves,
  micro-interaction patterns (button, form, toast, modal), and reduced-motion
  accessibility. Use when asked to "add animation", "make it feel alive",
  "micro-interactions", "transition", or "something feels janky/mechanical".
  Do NOT use for 3D or canvas animation — this covers UI-layer motion only.
origin: adapted:ux-ui-mastery
license: MIT © phazurlabs
version: 1.0.0
compatibility: "Any CSS/JS frontend. Outputs CSS variables + cubic-bezier values."
---

<!-- Adapted from phazurlabs/ux-ui-mastery (MIT) — Interaction & Motion Design skill.
     Duration table, easing curves, micro-interaction patterns, reduced-motion section.
     YAMTAM structure, Anti-Fake-Pass section, and CSS output format are original. -->

## When to Use

- Use when: adding transitions, hover states, or interactive feedback
- Use when: animations feel mechanical, too slow, or jarring
- Use when: implementing skeleton loading choreography
- Do NOT use for: Three.js / GSAP / Lottie — those are animation library decisions
- Do NOT use for: page-level routing transitions — use `aesthetic-anchor` motion tokens there

---

## Duration Scale

| Name | Range | Use |
|---|---|---|
| Instant | 0ms | Hover color, cursor change — never animate |
| Micro | 100–150ms | Button press, checkbox toggle, ripple |
| Small | 150–250ms | Tooltip appear, dropdown open, fade |
| Medium | 250–400ms | Panel slide, card expand |
| Large | 400–600ms | Modal + backdrop, page transition |
| Celebration | 600–1000ms | Onboarding, success milestone — use sparingly |

**Rules:**
- Under 100ms → no animation needed, instant change
- User-initiated actions: 150–300ms
- System-initiated changes: 200–500ms
- Mobile: 30% shorter than desktop equivalents
- Never exceed 1000ms in a regular workflow

---

## Easing Curves

```css
:root {
  /* Entering screen — fast start, decelerate to rest */
  --ease-out:    cubic-bezier(0.0, 0.0, 0.2, 1.0);

  /* Leaving screen — accelerate then exit */
  --ease-in:     cubic-bezier(0.4, 0.0, 1.0, 1.0);

  /* On-screen state change — smooth bidirectional */
  --ease-inout:  cubic-bezier(0.4, 0.0, 0.2, 1.0);
}
```

**Never use `linear` for UI motion** — it feels mechanical.
Exceptions only: infinite loaders, color interpolation.

Spring physics (JS): `stiffness: 170 / damping: 26 / mass: 1` — for playful bounce.

---

## Micro-Interaction Patterns

### Button
```css
/* Press */
button:active { transform: scale(0.97); transition: transform 80ms var(--ease-in); }
/* Release */
button { transition: transform 200ms var(--ease-out); }
/* Loading state: swap label for inline spinner — no layout shift */
/* Success: color → green + checkmark, 300ms */
/* Disabled: opacity 0.5, remove all hover states */
```

### Form field
```
Focus:   border-color transition 150ms --ease-inout
Success: green border + checkmark fade-in 200ms
Error:   red border + horizontal shake (±3px, 3 cycles, 300ms) + error text slide-down
```

### Toast / Notification
```
Enter:   slide from edge + fade-in, 300ms --ease-out
Persist: success = 3–5s, error = persistent (user must dismiss)
Exit:    fade + vertical slide, 200ms --ease-in
Stack:   50ms stagger between simultaneous toasts
```

### Modal
```
Backdrop: opacity 0 → 0.5, 200ms
Dialog:   scale 0.95 → 1.0 + fade-in, 250ms --ease-out
Dismiss:  reverse with --ease-in
```

---

## Emotional Motion Vocabulary

| Mood | Curve | Duration |
|---|---|---|
| Confident | ease-out | 200–250ms |
| Playful | spring / slight overshoot | 300–400ms |
| Urgent | ease-in, sharp | 100–150ms |
| Calm | ease-in-out, gentle | 300–500ms |
| Celebratory | particles / radial burst | 600–1000ms, once only |

---

## Reduced Motion (Accessibility Required)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Replace, don't remove:**
- Slide → instant appear or opacity fade
- Bounce/spin → static indicator
- Parallax → fixed background
- Keep: progress bars and functional loaders (simplify only)

---

## Anti-Fake-Pass Rules

Before claiming motion is done, you MUST show:
- [ ] Duration specified for every animated element (ms value, not "fast"/"slow")
- [ ] Easing curve used — no `linear` without justification
- [ ] `prefers-reduced-motion` override present in CSS
- [ ] No animation exceeds 1000ms in a regular workflow path

Reference: `gates/anti-fake-pass-gate.md`

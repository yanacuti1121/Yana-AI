---
name: impeccable
description: >
  Eliminate generic-looking UI — anti-default checklist, custom hover
  states, precision typography, non-stock spacing, surface depth, and
  production-grade polish that separates professional from template.
  Use when asked to "make this look less generic", "UI looks Bootstrap-y",
  "looks like a template", "add polish", "impeccable UI", "production
  quality design", "make it look custom", "it looks like every other
  SaaS app", "remove default styles", or "design lacks personality".
  Do NOT use for: design system token architecture — see design-system-gen.
  Do NOT use for: animation timing specifics — see motion-design.
origin: adapted:MIT © pbakaus
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Tailwind CSS, CSS Modules, vanilla CSS. Framework-agnostic."
---

## When to Use

- Use when: the UI looks "good enough" but not distinctive
- Use when: hover/focus states are missing or use browser defaults
- Use when: spacing feels arbitrary (pulled from a preset, not considered)
- Use when: the product lacks a visual personality or feels interchangeable
- Do NOT use for: animation timing — see motion-design
- Do NOT use for: full design system architecture — see design-system-gen

---

## The Anti-Generic Checklist

**Typography**
- [ ] Body text ≥ 16px — no 12px paragraphs
- [ ] Line height 1.5–1.65 on body; 1.2–1.3 on headings
- [ ] Letter-spacing: `-0.02em` on headings (tighter = more deliberate)
- [ ] No more than 2 typefaces — one for headings, one for body
- [ ] Max line length 60–75ch on paragraphs (not full-width)

**Color**
- [ ] Brand color appears in ≥ 1 interactive element per view
- [ ] Hover states shift color, not just cursor → pointer
- [ ] Error / success / warning have distinct, branded colors
- [ ] No pure `#000000` or `#ffffff` — use `#0f0f0f` and `#fafafa`
- [ ] Shadows use tinted color (`box-shadow: 0 4px 20px hsl(220 80% 50% / 0.15)`) not grey

**Spacing**
- [ ] Padding is not uniform — content zones have breathing room, dense zones don't
- [ ] Section margins follow a progression (not equal gaps everywhere)
- [ ] Icons and text are vertically aligned (not just floated adjacent)

**Surfaces**
- [ ] Cards have subtle shadows OR subtle borders — not both, not neither
- [ ] Hover state changes the surface, not just color (slight lift or border brightening)
- [ ] Inputs have a clear focus state that matches brand color

---

## Hover States That Feel Custom

```css
/* ❌ Default — only cursor changes */
button { cursor: pointer; }

/* ✅ Surface responds to interaction */
.btn-primary {
  background: var(--primary);
  transition: background 150ms, box-shadow 150ms, transform 80ms;
}
.btn-primary:hover {
  background: color-mix(in srgb, var(--primary) 85%, white);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--primary) 40%, transparent);
}
.btn-primary:active {
  transform: translateY(1px);
  box-shadow: none;
}
```

```tsx
/* Card lift on hover — subtle depth */
.card {
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
  transition: box-shadow 200ms, transform 200ms;
}
.card:hover {
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
  transform: translateY(-2px);
}
```

---

## Typography Precision

```css
/* Headings — tight, intentional */
h1, h2, h3 {
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.15;
  text-wrap: balance;       /* prevents awkward orphans on last line */
}

/* Body — readable, not cramped */
p {
  font-size: 1rem;
  line-height: 1.6;
  max-width: 70ch;
  color: hsl(220 15% 25%);    /* not pure black */
}

/* Labels — small but legible */
label, caption, .meta {
  font-size: 0.875rem;
  letter-spacing: 0.01em;
  color: hsl(220 10% 50%);
}
```

---

## Surface Depth — Not Flat, Not Glossy

```css
/* 3-level surface system */
:root {
  --surface-base:     hsl(220 14% 96%);    /* page background */
  --surface-raised:   hsl(0 0% 100%);      /* cards, panels */
  --surface-overlay:  hsl(0 0% 100%);      /* modals, dropdowns */

  /* shadows — tinted, not grey */
  --shadow-sm: 0 1px 2px   hsl(220 40% 15% / 0.06);
  --shadow-md: 0 4px 12px  hsl(220 40% 15% / 0.10);
  --shadow-lg: 0 16px 40px hsl(220 40% 15% / 0.14);
}

.card      { background: var(--surface-raised);   box-shadow: var(--shadow-sm); }
.modal     { background: var(--surface-overlay);  box-shadow: var(--shadow-lg); }
.dropdown  { background: var(--surface-overlay);  box-shadow: var(--shadow-md); }
```

---

## Small Details That Separate Good from Great

```css
/* Text selection matches brand */
::selection {
  background: color-mix(in srgb, var(--primary) 25%, transparent);
  color: inherit;
}

/* Scrollbar — brand-tinted on WebKit */
::-webkit-scrollbar       { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: hsl(220 10% 80%);
  border-radius: 99px;
}
::-webkit-scrollbar-thumb:hover {
  background: hsl(220 10% 65%);
}

/* Input placeholder — not identical to entered text */
::placeholder { color: hsl(220 10% 65%); font-style: italic; }

/* Smooth scrolling */
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
```

---

## Anti-Fake-Pass Rules

Before claiming UI polish is done, you MUST show:
- [ ] Every interactive element has a custom hover + active state
- [ ] No pure black or pure white — use near-black/near-white
- [ ] Shadows are tinted (brand hue), not grey
- [ ] Body text is 16px+ with line-height ≥ 1.5
- [ ] Headings have negative letter-spacing (-0.02em to -0.03em)
- [ ] `::selection` color matches brand
- [ ] Cards/surfaces have consistent depth level (shadow or border, not both randomly)
- [ ] Max paragraph width set to ~70ch

Reference: `gates/anti-fake-pass-gate.md`

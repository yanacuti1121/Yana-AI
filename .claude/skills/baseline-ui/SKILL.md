---
name: baseline-ui
description: >
  Establish CSS/Tailwind baseline quality — font smoothing, line-height
  defaults, box-sizing, focus rings, color contrast, Tailwind anti-patterns,
  and CSS containment. Use when asked to "set up CSS baseline", "Tailwind
  best practices", "fix font rendering", "global CSS foundation",
  "typography defaults", "CSS anti-patterns", "improve CSS quality",
  "line-height reset", "normalize styles", or reviewing a new project's
  base styles for correctness. Do NOT use for: full design system token
  architecture — see design-system-gen. Do NOT use for: component-level
  animation — see motion-design.
origin: adapted:MIT © Ibelick
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Tailwind CSS v3/v4, vanilla CSS. Framework-agnostic."
---

## When to Use

- Use when: starting a new project and setting up global styles
- Use when: font rendering looks inconsistent across macOS/Windows
- Use when: Tailwind utility soup is making components unreadable
- Use when: auditing a project's base CSS before a UI polish pass
- Do NOT use for: full token system — that's design-system-gen
- Do NOT use for: component animation patterns — that's motion-design

---

## Essential CSS Baseline

```css
/* globals.css — apply before any component styles */
*, *::before, *::after {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;   /* prevent iOS font inflation */
  text-size-adjust: 100%;
  tab-size: 4;
}

body {
  margin: 0;
  line-height: 1.5;                 /* browser default is ~1.2 — too tight */
  -webkit-font-smoothing: antialiased;   /* macOS: crisp text */
  -moz-osx-font-smoothing: grayscale;
  font-synthesis: none;             /* prevent fake bold/italic */
  text-rendering: optimizeLegibility;
}

img, svg, video, canvas, audio, iframe, embed, object {
  display: block;                   /* removes 4px phantom gap under inline media */
  max-width: 100%;
}

p, h1, h2, h3, h4, h5, h6 {
  overflow-wrap: break-word;        /* prevent text overflow on small viewports */
}

/* Remove default focus outline ONLY for mouse, keep for keyboard */
:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
:focus:not(:focus-visible) {
  outline: none;
}
```

---

## Tailwind Anti-Patterns

```tsx
// ❌ Utility soup — unreadable, hard to maintain
<div className="flex flex-col items-center justify-center w-full h-full bg-white dark:bg-gray-900 px-4 py-8 gap-6 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-200">

// ✅ Extract to component or @apply for repeated patterns
// Option A: component (preferred for React)
function Card({ children }: { children: ReactNode }) {
  return (
    <div className="card">
      {children}
    </div>
  );
}

// Option B: @apply for global patterns
@layer components {
  .card {
    @apply flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-lg;
  }
}
```

```tsx
// ❌ Magic numbers in utilities
<div className="w-[347px] h-[62px]">

// ✅ Use design tokens or semantic spacing
<div className="w-80 h-16">  /* or CSS variable */
```

```tsx
// ❌ Hardcoded colors breaking dark mode
<p className="text-gray-600">

// ✅ Semantic color tokens
<p className="text-muted-foreground">  /* maps to CSS variable */
```

---

## Typography Scale

```css
/* Clamp-based fluid typography — no media query breakpoints needed */
:root {
  --font-xs:   clamp(0.75rem, 0.5vw + 0.65rem, 0.875rem);
  --font-sm:   clamp(0.875rem, 0.5vw + 0.75rem, 1rem);
  --font-base: clamp(1rem, 0.5vw + 0.875rem, 1.125rem);
  --font-lg:   clamp(1.125rem, 1vw + 0.875rem, 1.375rem);
  --font-xl:   clamp(1.375rem, 2vw + 0.75rem, 1.875rem);
  --font-2xl:  clamp(1.875rem, 4vw + 0.5rem, 3rem);
  --font-3xl:  clamp(2.5rem, 6vw + 0.5rem, 4.5rem);
}
```

```tsx
// Tailwind config — map to custom font sizes
// tailwind.config.ts
export default {
  theme: {
    extend: {
      fontSize: {
        'fluid-sm':   'var(--font-sm)',
        'fluid-base': 'var(--font-base)',
        'fluid-xl':   'var(--font-xl)',
        'fluid-3xl':  'var(--font-3xl)',
      }
    }
  }
}
```

---

## CSS Containment

```css
/* Apply to card-like components to limit browser repaint scope */
.card, .modal, .sidebar {
  contain: layout style;   /* browser repaints only this box, not the page */
}

/* content-visibility: skip rendering off-screen elements */
.long-list-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 80px;  /* hint to prevent layout shift */
}
```

---

## Common Baseline Failures

| Issue | Symptom | Fix |
|---|---|---|
| No `box-sizing: border-box` | Padding blows out widths | Global `* { box-sizing: border-box }` |
| Missing `antialiased` | Blurry/thick text on Mac | `font-smoothing: antialiased` |
| `:focus { outline: none }` | Keyboard users lose focus | Use `:focus-visible` instead |
| `line-height: normal` (browser ~1.2) | Tight, hard-to-read body text | Set `line-height: 1.5` on `body` |
| Inline `<img>` | 4px phantom gap below image | `img { display: block }` |
| `overflow-wrap` missing | Long words break layout on mobile | Add to all text elements |

---

## Anti-Fake-Pass Rules

Before claiming baseline CSS is done, you MUST show:
- [ ] `box-sizing: border-box` applied globally
- [ ] `font-smoothing` set — text renders crisply on Mac
- [ ] `:focus-visible` used — NOT `outline: none` globally
- [ ] `line-height: 1.5` on `body` — not browser default
- [ ] All `<img>` elements are `display: block` or have explicit dimensions
- [ ] No hardcoded color values breaking dark mode
- [ ] Utility class count per element stays below ~8 (extract if exceeded)

Reference: `gates/anti-fake-pass-gate.md`

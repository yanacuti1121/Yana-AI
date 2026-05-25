---
name: design-system-gen
description: >
  Generate a complete design token system for a new project — color palette,
  typography scale, spacing, shadows, and border radius — tailored to the
  product type (SaaS, e-commerce, healthcare, fintech, creative, etc.).
  Use when starting a new project with no design system, when the user asks
  to "set up design tokens", "create a design system", or "what colors/fonts
  should I use for a [product type]".
  Do NOT use when the project already has tokens — use ui-redesign instead.
origin: adapted:ui-ux-pro-max
license: MIT © 2026 nextlevelbuilder
version: 1.0.0
compatibility: "Outputs CSS custom properties. Adaptable to Tailwind config, Figma tokens, or JS theme objects."
---

<!-- Adapted from nextlevelbuilder/ui-ux-pro-max-skill (MIT) — product-type taxonomy and
     design system generation concept. All content written original for YAMTAM.
     No Python code or search engine logic ported. -->

## When to Use

- Use when: starting a new project with no design tokens defined
- Use when: user asks "what design system should I use for a [type] app?"
- Use when: user says "set up colors and fonts for this project"
- Do NOT use when: design tokens already exist — extend or refactor them instead
- Do NOT use when: an aesthetic anchor has already been set — use `aesthetic-anchor` to derive tokens from that anchor instead

## Product Type Reference

Choose the product category first — it determines the emotional register of the system.

| Type | Tone | Color tendency | Typography |
|------|------|----------------|------------|
| **SaaS / Dev Tool** | Confident, precise | Neutral base + one blue/violet accent | Inter, Geist, DM Sans |
| **Fintech / Finance** | Trustworthy, stable | Deep navy + gold or green accent | Sora, IBM Plex Sans |
| **Healthcare** | Calm, clear, reassuring | Soft blue/teal + high contrast text | Source Sans, Nunito |
| **E-commerce** | Energetic, conversion-focused | Brand color + high-contrast CTA | Poppins, Plus Jakarta Sans |
| **Creative / Portfolio** | Expressive, distinctive | Monochrome + one bold accent or full aesthetic anchor | Clash Display, Cabinet Grotesk |
| **Marketplace** | Friendly, trustworthy | Warm neutral + accent | Outfit, Manrope |
| **AI / Data** | Intelligent, technical | Dark with electric blue/green | Space Grotesk, Geist Mono |
| **Lifestyle / Wellness** | Warm, human, approachable | Warm pastels + muted tones | Lato, Raleway, Quicksand |

## How It Works

1. **Identify product type** — ask if not stated
2. **Choose aesthetic register** (see table above)
3. **Generate the 5 token layers** in order
4. **Validate against WCAG AA** — text/background contrast ≥ 4.5:1
5. **Output as CSS custom properties** — or Tailwind config if requested

## The 5 Token Layers

### Layer 1 — Color
```
--color-bg-base:       (page background)
--color-bg-surface:    (card, panel — slightly elevated from base)
--color-bg-overlay:    (modal, tooltip — highest elevation)
--color-text-primary:  (headings, main content)
--color-text-secondary:(labels, captions — lower contrast)
--color-text-muted:    (placeholders, disabled)
--color-accent:        (primary action, links, active states)
--color-accent-hover:  (10-15% darker than accent)
--color-danger:        (errors, destructive actions — #E53E3E baseline)
--color-success:       (confirmations — #38A169 baseline)
--color-warning:       (caution — #D69E2E baseline)
--color-border:        (dividers, input borders)
```

### Layer 2 — Typography
```
--font-display:   (headings — personality font)
--font-body:      (body copy — readable font)
--font-mono:      (code, data — monospace)

--text-xs:    0.75rem  / line-height: 1.0rem
--text-sm:    0.875rem / line-height: 1.25rem
--text-base:  1rem     / line-height: 1.5rem
--text-lg:    1.125rem / line-height: 1.75rem
--text-xl:    1.25rem  / line-height: 1.75rem
--text-2xl:   1.5rem   / line-height: 2rem
--text-3xl:   1.875rem / line-height: 2.25rem
--text-4xl:   2.25rem  / line-height: 2.5rem
```

### Layer 3 — Spacing
```
4px base unit. All values are multiples.
--space-1: 4px   --space-2: 8px   --space-3: 12px  --space-4: 16px
--space-5: 20px  --space-6: 24px  --space-8: 32px  --space-10: 40px
--space-12: 48px --space-16: 64px --space-20: 80px --space-24: 96px
```

### Layer 4 — Elevation (Shadows)
```
--shadow-sm:  0 1px 2px rgba(0,0,0,0.05)
--shadow-md:  0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)
--shadow-lg:  0 10px 15px rgba(0,0,0,0.10), 0 4px 6px rgba(0,0,0,0.05)
--shadow-xl:  0 20px 25px rgba(0,0,0,0.10), 0 10px 10px rgba(0,0,0,0.04)
```

### Layer 5 — Shape
```
--radius-sm:   4px   (inputs, small badges)
--radius-md:   8px   (cards, buttons)
--radius-lg:   12px  (panels, modals)
--radius-xl:   16px  (large cards)
--radius-full: 9999px (pills, avatars)
```

## Output Format

Output in this order:
1. Product type identified + rationale (2 sentences)
2. Complete `:root { }` block with all tokens filled in
3. Font import line (Google Fonts or system stack)
4. Contrast check: text-primary on bg-base ratio (must be ≥ 4.5:1)

```css
/* Design System — [Product Type] | [Tone] */
/* Generated by YAMTAM design-system-gen */

@import url('...');  /* font import */

:root {
  /* Color */
  --color-bg-base: ...;
  ...

  /* Typography */
  --font-display: ...;
  ...

  /* Spacing — 4px base */
  --space-1: 4px;
  ...

  /* Elevation */
  --shadow-sm: ...;
  ...

  /* Shape */
  --radius-md: 8px;
  ...
}

/* Contrast check: --color-text-primary on --color-bg-base = X.X:1 ✓/✗ */
```

## Gotchas

- Never use pure black (#000000) for body text — use #1A1A1A or #111827 for softer reading
- Never use pure white (#FFFFFF) for backgrounds in wellness/organic products — use a warm off-white
- Accent color must work on both light and dark surfaces — verify both contrast ratios
- If adapting this system to Tailwind: map tokens to `extend.colors` and `extend.fontFamily`, not override
- Healthcare: avoid red as accent — red triggers alarm responses; use teal or blue instead

## Anti-Fake-Pass Rules

Before claiming the design system is done, you MUST show:
- [ ] Product type identified and stated
- [ ] All 5 layers output — no layer skipped
- [ ] Contrast ratio shown for text-primary on bg-base (number, not just "✓")
- [ ] Font names are real, loadable fonts (Google Fonts, system stack, or specified CDN)

Reference: `gates/anti-fake-pass-gate.md` | `gates/ui-quality-gate.md`

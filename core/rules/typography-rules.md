# Yana AI — Typography Rules
# Source: github/primer/primitives (tokens/functional/typography) + modern-font-stacks

**Status:** Active  
**Enforced by:** UI Quality Gate L5, frontend agents  
**Companion skills:** `typography-system`, `baseline-ui`, `design-system-gen`
**Companion rule:** `anti-ai-slop-design-law.md` — heading/type clichés (gradient
text, tiny uppercase eyebrows) this file's token rules don't catch

---

## Font Stack Policy

Always use system fonts or a curated stack. Never load external fonts without explicit user approval.

```css
/* Default — clean, fast, cross-platform */
--font-sans:   ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
               "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

/* Monospace — code blocks, terminals */
--font-mono:   ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
               "Liberation Mono", monospace;

/* Humanist — readable body text, warm feel */
--font-humanist: Seravek, "Gill Sans Nova", Ubuntu, Calibri,
                 "DejaVu Sans", source-sans-pro, sans-serif;

/* Geometric — modern headers, tech products */
--font-geometric: Avenir, Montserrat, Corbel, "URW Gothic",
                  source-sans-pro, sans-serif;

/* Neo-brutalist — high contrast, editorial */
--font-slab:  Rockwell, "Rockwell Nova", "Roboto Slab", "DejaVu Serif",
              "Sitka Small", serif;
```

**Rule:** `font-family: Arial` or bare `sans-serif` alone is REJECTED. Always use a full stack.

---

## Type Scale (GitHub Primer standard)

| Token | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `--font-size-xs`    | 0.75rem (12px)  | 1.333 | 400 | Captions, labels, badges |
| `--font-size-sm`    | 0.875rem (14px) | 1.428 | 400 | Secondary text, metadata |
| `--font-size-base`  | 1rem (16px)     | 1.5   | 400 | Body, inputs, default |
| `--font-size-md`    | 1.125rem (18px) | 1.555 | 400 | Lead text, card body |
| `--font-size-lg`    | 1.25rem (20px)  | 1.6   | 600 | Section subheadings |
| `--font-size-xl`    | 1.5rem (24px)   | 1.333 | 600 | Page section titles |
| `--font-size-2xl`   | 2rem (32px)     | 1.25  | 700 | Page headings |
| `--font-size-3xl`   | 3rem (48px)     | 1.125 | 700 | Hero / marketing headers |

```css
/* CSS custom properties — wire into Tailwind or globals.css */
:root {
  --font-size-xs:   0.75rem;
  --font-size-sm:   0.875rem;
  --font-size-base: 1rem;
  --font-size-md:   1.125rem;
  --font-size-lg:   1.25rem;
  --font-size-xl:   1.5rem;
  --font-size-2xl:  2rem;
  --font-size-3xl:  3rem;

  --line-height-condensed: 1.25;
  --line-height-default:   1.5;
  --line-height-relaxed:   1.625;

  --font-weight-normal:   400;
  --font-weight-medium:   500;
  --font-weight-semibold: 600;
  --font-weight-bold:     700;
}
```

---

## Hard Rules (non-negotiable)

```
❌ REJECT: font-size < 12px on any visible text
❌ REJECT: body text font-size < 16px (use 14px only for secondary/metadata)
❌ REJECT: line-height < 1.4 on any paragraph text
❌ REJECT: more than 3 distinct font-sizes in a single view
❌ REJECT: more than 2 distinct font-families in a project
❌ REJECT: loading web fonts without font-display: swap
❌ REJECT: heading font-weight < 600
❌ REJECT: body font-weight > 500 (bold body text = visual noise)
❌ REJECT: paragraph max-width > 75ch (too wide to read comfortably)
```

---

## Heading Hierarchy

```
h1: --font-size-3xl or 2xl, weight 700, letter-spacing -0.02em to -0.03em
h2: --font-size-2xl, weight 700, letter-spacing -0.02em
h3: --font-size-xl, weight 600
h4: --font-size-lg, weight 600
h5/h6: --font-size-base or sm, weight 600, text-transform uppercase optional

Rule: never skip heading levels (h1 → h3 skipping h2 = REJECT)
Rule: text-wrap: balance on headings ≤ 4 words (prevents orphaned single words)
```

---

## Agent Enforcement

Before an agent delivers any frontend component:
- [ ] Font stack uses full system font fallback chain (not single font name)
- [ ] Body text is 16px+ with line-height ≥ 1.5
- [ ] All heading font weights ≥ 600
- [ ] No more than 3 font sizes visible in a single view
- [ ] Paragraph max-width ≤ 75ch
- [ ] Headings use negative letter-spacing (-0.02em minimum)

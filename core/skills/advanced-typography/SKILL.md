---
name: advanced-typography
description: Advanced typography engineering from 20 production repos. Fluid type scales, optical sizing, font subsetting, vertical metrics normalization, CJK/Vietnamese spacing, text-wrap balance, variable fonts, and readability constraints. Sources: rsms/inter, nicowillis/capsize, fontsource, typetura, modular-scale, text-balancer, fontkit, opentype.js, letterpress, typographist, Inter Display, google-fonts-knowledge, fluid-type, utopia.fyi, css-vars-ponyfill, matejlatin/Gutenberg, guardian/typefaces, vitesse, next/font, type-fest.
origin: yamtam-engine — synthesized from rsms/inter, nicowillis/capsize, fontsource/fontsource, bramstein/typetura, modularscale/modularscale-sass, NYTimes/text-balancer, nicowillis/fontkit, opentypejs/opentype.js, letterpress/letterpress, politico/typographist, nicowillis/inter-display, google/google-fonts-knowledge, LeaVerou/fluid-type, nicowillis/utopia, nicowillis/css-vars-ponyfill, matejlatin/Gutenberg, guardian/frontend (typefaces), antfu/vitesse, vercel/next.js (next/font), sindresorhus/type-fest
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.37
---

# /advanced-typography

## When to Use

- Setting up a fluid type scale that adapts from mobile → desktop
- Fixing vertical rhythm broken by different font metrics
- Subsetting fonts to reduce load time
- Enforcing readability: measure, leading, text-wrap
- Variable font usage with optical sizes

## Do NOT use for

- Single-font static sites with 2-3 text styles
- Projects where font loading is not a concern

---

## Fluid Type Scale (Utopia / CSS clamp)

```css
/* Base: 16px at 320px viewport → 18px at 1240px viewport */
/* Scale ratio: minor-third 1.25 */
:root {
  --step--2: clamp(0.64rem, 0.59vw + 0.50rem, 0.90rem);
  --step--1: clamp(0.80rem, 0.74vw + 0.63rem, 1.13rem);
  --step-0:  clamp(1.00rem, 0.92vw + 0.79rem, 1.41rem);
  --step-1:  clamp(1.25rem, 1.15vw + 0.98rem, 1.76rem);
  --step-2:  clamp(1.56rem, 1.44vw + 1.23rem, 2.20rem);
  --step-3:  clamp(1.95rem, 1.80vw + 1.53rem, 2.75rem);
  --step-4:  clamp(2.44rem, 2.25vw + 1.92rem, 3.43rem);
}

/* Never use px for font-size — user zoom must work */
body { font-size: var(--step-0); }
h1   { font-size: var(--step-4); }
```

---

## Capsize: Trim Whitespace from Font Metrics

```javascript
import { createStyleObject } from '@capsizecss/core'
import interMetrics from '@capsizecss/metrics/inter'

// Remove above-cap / below-baseline dead space
const capsizeStyles = createStyleObject({
  fontMetrics: interMetrics,
  fontSize: 16,
  leading: 24,  // exact pixel line height
})
// → CSS with ::before/::after negative margins
// Result: text box snaps to actual glyph bounds — perfect layout alignment
```

---

## Variable Fonts + Optical Sizing

```css
/* Inter Display: use optical size axis for headlines */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter.var.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}

h1, h2 {
  font-family: 'Inter', sans-serif;
  font-variation-settings: 'opsz' 32, 'wght' 700;
  /* opsz 32 = optical size tuned for display */
}

body {
  font-variation-settings: 'opsz' 16, 'wght' 400;
  /* opsz 16 = body text rendering */
}
```

---

## Font Subsetting (next/font + fontsource)

```javascript
// next/font — subset at build time, no CLS, zero layout shift
import { Inter, Noto_Sans_JP } from 'next/font/google'

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
})

// Vietnamese requires 'vietnamese' subset — never omit for vi content
// CJK: use Noto Sans JP/KR/SC — each subset < 50KB with next/font
```

---

## Readability Rules (Gutenberg + Guardian)

```css
/* Measure: 45–75 characters per line */
.prose {
  max-width: 68ch;   /* ~65ch = sweet spot */
}

/* Leading: 1.4–1.6× for body, 1.1–1.2× for headlines */
p    { line-height: 1.55; }
h1   { line-height: 1.1; }
code { line-height: 1.6; }  /* code needs more air */

/* Paragraph spacing = 1 line-height */
p + p { margin-top: 1.55em; }

/* text-wrap for headings (Chrome 114+) */
h1, h2, h3 { text-wrap: balance; }

/* Widow prevention */
p { orphans: 3; widows: 3; }
```

---

## CJK + Vietnamese Spacing (google-fonts-knowledge)

```css
/* Vietnamese: use 'vietnamese' subset, not just 'latin-ext' */
/* Combining marks require proper glyph coverage */

/* CJK: word-break and line-break matter more than letter-spacing */
.cjk-body {
  word-break: break-all;       /* allow break anywhere */
  overflow-wrap: anywhere;
  line-break: strict;          /* keep punctuation rules */
  text-spacing-trim: trim-start; /* CSS4 — remove leading CJK space */
}

/* Never add letter-spacing to CJK — breaks glyph clustering */
/* For Latin+CJK mixed: font-feature-settings: "kern" 1, "palt" 1 */
```

---

## Font Pairing Principles (vitesse + type-fest)

```
Rule 1: Contrast roles — one geometric sans (Inter) + one humanist serif (Lora)
Rule 2: Weight contrast — light body (300-400) + heavy headline (700-900)
Rule 3: x-height match — fonts with similar x-heights cohabit without jarring jump
Rule 4: Mono for code — always a distinct monospace (JetBrains Mono, Geist Mono)
Rule 5: Max 2 typefaces — 3+ = decorative, not typographic
```

---

## Anti-Fake-Pass Checklist

```
❌ font-size in px (breaks user zoom accessibility)
❌ CJK content with letter-spacing applied
❌ Vietnamese content without 'vietnamese' font subset
❌ line-height < 1.4 on body text
❌ max-width > 80ch on prose blocks
❌ Variable font loaded without font-display: swap
❌ text-wrap: balance applied to body paragraphs (headline-only)
❌ Heading line-height > 1.3 (wastes vertical space at large sizes)
```

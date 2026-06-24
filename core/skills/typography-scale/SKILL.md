---
name: typography-scale
description: Mathematical typography scale system. Generates harmonious type hierarchies using golden ratio, perfect fifth, and other classical scales. Handles font pairing, line-height binding, CJK/special character spacing, and system font optimization. Sources: type-scale.com, google/fonts, braid-design-system, guardian/frontend, nytimes/typography, and 5 others.
origin: yana-ai — synthesized from type-scale/type-scale.com, google/fonts, components-ai/theme, vladocar/minimal-css-typography, rasmusbe/font-smoothing, braid-design-system/braid, guardian/frontend, sparanoid/chinese-copywriting-guidelines, tachyons-css/tachyons-typography, nytimes/typography
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.35
---

# /typography-scale

## When to Use

- Establishing type hierarchy for a new project
- Fixing inconsistent font sizes ("these headings feel random")
- Optimizing for readability on long-form content
- Adding CJK/Vietnamese/Arabic language support

## Do NOT use for

- Single-page microsites with one font size
- Data tables (use monospace + fixed sizing instead)

---

## Classical Scale Ratios (type-scale.com)

```
Golden Ratio    : 1.618  — dramatic hierarchy, editorial
Perfect Fifth   : 1.500  — strong, classic
Augmented Fourth: 1.414  — modern, balanced (√2)
Major Third     : 1.250  — subtle, content-heavy
Minor Third     : 1.200  — dense UI, dashboards
Major Second    : 1.125  — very tight, data-heavy
```

### Scale generation from base (16px default)

```javascript
function typeScale(base = 16, ratio = 1.25, steps = 6) {
  return Object.fromEntries(
    Array.from({ length: steps }, (_, i) => [
      `step-${i}`,
      `${(base * Math.pow(ratio, i - 1)).toFixed(2)}px`
    ])
  )
}
// Major Third (1.25) from 16px:
// step-0: 12.8px  step-1: 16px  step-2: 20px
// step-3: 25px    step-4: 31.25px  step-5: 39.06px
```

---

## Semantic Naming (Braid + Guardian)

```css
:root {
  --text-xs:   0.75rem;   /* 12px — labels, badges */
  --text-sm:   0.875rem;  /* 14px — captions, secondary */
  --text-base: 1rem;      /* 16px — body text */
  --text-lg:   1.25rem;   /* 20px — lead paragraph */
  --text-xl:   1.563rem;  /* 25px — h3 */
  --text-2xl:  1.953rem;  /* 31.25px — h2 */
  --text-3xl:  2.441rem;  /* 39px — h1 */
  --text-4xl:  3.052rem;  /* 48.8px — hero */
}
```

---

## Line-Height Binding (Braid Design System rule)

Line-height must scale with font size — never use a fixed value:

```css
/* ❌ Fixed line-height breaks at large sizes */
p { font-size: var(--text-3xl); line-height: 1.5rem; }

/* ✅ Unitless ratio — scales with font size */
--lh-tight:  1.2;   /* headings */
--lh-normal: 1.5;   /* body */
--lh-loose:  1.8;   /* long-form reading */

h1 { font-size: var(--text-3xl); line-height: var(--lh-tight); }
p  { font-size: var(--text-base); line-height: var(--lh-normal); }
```

---

## Font Pairing Principles (google/fonts)

Best-practice pairing patterns:
1. **Contrast in classification** — Serif heading + Sans body (NYT, Guardian)
2. **Same superfamily** — Inter Display + Inter Text
3. **Geometric + Humanist** — Futura heading + Gill Sans body

```css
/* NYT pattern — editorial authority */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Source+Serif+4:ital,wght@0,400;1,400&display=swap');

/* System font stack — no external request (vladocar/minimal) */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
             'Helvetica Neue', Arial, sans-serif;
```

---

## CJK / Vietnamese / Special Character Spacing (sparanoid)

```css
/* Chinese copywriting: space between CJK and Latin */
/* Use thin space U+2009 between Chinese and English words */
/* ❌ 中文English  →  ✅ 中文 English */

/* Vietnamese tone marks need proper line-height */
:lang(vi) {
  line-height: 1.7;  /* extra space for diacritics */
  word-spacing: 0.05em;
}

/* CJK line break — don't orphan single characters */
:lang(zh), :lang(ja), :lang(ko) {
  overflow-wrap: anywhere;
  line-break: strict;
}
```

---

## Font Smoothing (rasmusbe)

```css
/* macOS — subpixel smoothing can cause thin fonts to look blurry */
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Only use subpixel on dark backgrounds */
.dark-bg { -webkit-font-smoothing: subpixel-antialiased; }
```

---

## Skimmability Rules (NYT pattern)

Long-form content must support visual scanning:
1. First 3 words of paragraph carry the meaning
2. Drop caps or pull quotes every 400 words
3. Headers every 200–300 words maximum
4. No paragraph longer than 100 words

---

## Anti-Pattern Checklist

```
❌ Font sizes not from scale (font-size: 13px, 17px, 22px)
❌ Fixed line-height in px on headings
❌ More than 3 font families in one project
❌ CJK text with line-height < 1.6
❌ Body text smaller than 16px on desktop
❌ Missing system font fallback (custom font only)
```

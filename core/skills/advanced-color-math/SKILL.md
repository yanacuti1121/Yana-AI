---
name: advanced-color-math
description: Advanced color science and dynamic palette generation from 20 production repos. LCH/OKLAB perceptual math, dark-mode pair algorithms, contrast enforcement, gamut mapping, CSS color-mix(), and color extraction from images. Sources: chroma.js, culori, color.js, tinycolor2, d3-color, radix-ui/colors, primer/primitives, open-color, Ant Design palette, Atlassian color, Shopify Polaris tokens, vanilla-colorful, colorette, color2k, react-colorful, polychrome, bottosson/oklab, values.css, khroma, nivo/colors.
origin: yana-ai — synthesized from gka/chroma.js, Evercoder/culori, nicowillis/colorjs, bgrins/tinycolor, d3/d3-color, radix-ui/colors, primer/primitives, yeun/open-color, ant-design/ant-design (palette algo), atlassian/atlassian-frontend-mirror, Shopify/polaris-tokens, web-padawan/vanilla-colorful, jorgebucaran/colorette, ricokahler/color2k, omgovich/react-colorful, Adechizy/polychrome, bottosson/oklab, values-css/values.css, google/khroma, plouc/nivo
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.37
---

# /advanced-color-math

## When to Use

- Generating multi-stop palettes programmatically (brand → 10-step scale)
- Dark mode: finding perceptually equal light/dark pairs
- Enforcing WCAG AA/AAA contrast ratios automatically
- CSS `color-mix()` and `oklch()` in production
- Extracting dominant color from user-uploaded images

## Do NOT use for

- Static palette picking (use a color tool instead)
- Consumer branding decisions (perceptual math ≠ brand taste)

---

## Color Space Decision Tree

```
Need gradient?          → oklch() — uniform hue, no "muddy middle"
Need dark-mode pair?    → LCH lightness mirror (L=30↔L=70)
Need contrast check?    → WCAG relative luminance (sRGB → linear)
Need gamut mapping?     → CSS color-gamut: p3 + @supports
Need tint/shade scale?  → Ant Design algorithm (HSB rotation)
```

---

## OKLAB/OKLCH Perceptual Gradient (culori + bottosson/oklab)

```javascript
import { interpolate, formatHex } from 'culori'

// OKLCH gradient — hue stays vivid, no gray muddy middle
const gradient = interpolate(['#3b82f6', '#ec4899'], 'oklch')
const stops = Array.from({ length: 11 }, (_, i) => formatHex(gradient(i / 10)))
// → smooth blue-to-pink, no desaturated midpoint

// CSS native (Chrome 111+)
background: linear-gradient(to right,
  oklch(62% 0.2 264),
  oklch(64% 0.28 0)
);
```

---

## Dark-Mode Pair Algorithm (Atlassian + Radix UI)

```javascript
import { wcagContrast } from 'culori'

// Mirror at L=50 in OKLCH, then nudge for contrast
function darkPair(lightHex) {
  const c = oklch(lightHex)
  const darkL = c.l > 0.5 ? 1 - c.l + 0.05 : c.l
  const candidate = { mode: 'oklch', l: darkL, c: c.c, h: c.h }
  // Enforce 4.5:1 on dark bg (#1a1a1a = L≈0.12)
  return wcagContrast(candidate, '#1a1a1a') >= 4.5
    ? formatHex(candidate)
    : lighten(candidate, 0.1)  // nudge until passing
}
```

---

## Ant Design 10-Step Palette Algorithm

```javascript
// Hue rotation: darks shift -4°, lights shift +10°
// Saturation: darks -9%, lights pinned at input S
// Brightness: 10 steps from 95% (lightest) → input B (darkest)
function generatePalette(hex) {
  const [h, s, b] = toHSB(hex)
  return Array.from({ length: 10 }, (_, i) => {
    const t = i / 9
    const hShift = t < 0.5 ? h + 10 * (1 - t * 2) : h - 4 * (t - 0.5) * 2
    const sVal = t < 0.5 ? s * (t * 2) : s
    const bVal = 95 - (95 - b) * t
    return fromHSB(hShift, sVal, bVal)
  })
}
```

---

## WCAG Contrast Enforcement (tinycolor2 / culori)

```javascript
import { wcagContrast } from 'culori'

function enforceContrast(fg, bg, level = 'AA') {
  const min = level === 'AAA' ? 7 : 4.5
  let candidate = fg
  while (wcagContrast(candidate, bg) < min) {
    // Darken fg by 5% OKLCH lightness
    candidate = adjust(candidate, { l: -0.05 })
    if (oklch(candidate).l < 0.05) break  // give up at pure black
  }
  return formatHex(candidate)
}

// Radix UI approach: pre-compute all 12-step scales so any fg/bg combo passes
```

---

## CSS color-mix() + Gamut Mapping

```css
/* CSS native blend — no JS needed */
.badge-muted {
  background: color-mix(in oklch, var(--color-primary) 20%, transparent);
}

/* P3 wide gamut with sRGB fallback */
.vibrant {
  color: #ff6b6b;  /* sRGB fallback */
  color: color(display-p3 1 0.3 0.3);  /* wider gamut */
}

/* Gamut-safe oklch */
@supports (color: oklch(0 0 0)) {
  .vibrant { color: oklch(65% 0.28 27); }
}
```

---

## Image Color Extraction (vibrant.js / color-thief pattern)

```javascript
import Vibrant from 'node-vibrant'

const palette = await Vibrant.from(imageUrl).getPalette()
// Swatches: Vibrant, LightVibrant, DarkVibrant, Muted, LightMuted, DarkMuted
const primary = palette.Vibrant?.hex ?? '#3b82f6'
const onPrimary = wcagContrast(primary, '#fff') >= 4.5 ? '#fff' : '#000'

// nivo uses this pattern for chart auto-coloring from data
```

---

## Anti-Fake-Pass Checklist

```
❌ Gradient interpolated in sRGB (desaturated gray midpoint)
❌ Dark-mode color picked visually without contrast check
❌ Palette steps with identical perceived lightness
❌ color-mix() used without sRGB fallback
❌ Image color extraction used without WCAG check on extracted color
❌ oklch() used in production without @supports guard
```

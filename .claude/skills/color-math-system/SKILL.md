---
name: color-math-system
description: Mathematically correct color system generation. Produces WCAG-compliant palettes, dark mode pairs, gradient smoothing, and dominant color extraction using LCH/LAB color math. Sources: framer/motion-palette, hughsk/color-space, gka/chroma.js, ant-design/ant-design-colors, atlassian/colors, and 5 others.
origin: yamtam-engine — synthesized from framer/motion-palette, steveruizok/perfect-freehand, hughsk/color-space, ixora/color-thief, gka/chroma.js, meodai/color-names, ant-design/ant-design-colors, atlassian/colors, primer/github-colors, tailwindlabs/tailwindcss-palette-generator
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.35
---

# /color-math-system

## When to Use

- Generating a color palette from a single brand color
- Ensuring dark mode pairs meet WCAG AA (4.5:1) contrast
- Smoothing gradients that look "dirty" or have mach banding
- Extracting a palette from a logo or hero image

## Do NOT use for

- Choosing brand colors (that's a design decision, not math)
- Overriding an existing validated color system

---

## The "Dirty Color" Problem (hughsk/color-space)

RGB interpolation produces visually inconsistent gradients because RGB is
perceptually non-uniform. Always interpolate in **LCH or OKLAB** space.

```javascript
// ❌ Dirty gradient — interpolating in RGB
const midpoint = { r: (r1+r2)/2, g: (g1+g2)/2, b: (b1+b2)/2 }

// ✅ Clean gradient — interpolating in LCH (chroma.js)
import chroma from 'chroma-js'
const scale = chroma.scale([color1, color2]).mode('lch').colors(10)
```

---

## 10-Step Palette Generation (Ant Design algorithm)

Given one brand color (e.g. `#1677FF`), generate steps 50–950:

```javascript
import chroma from 'chroma-js'

function generatePalette(baseColor) {
  const base = chroma(baseColor)
  return {
    50:  base.luminance(0.95).hex(),
    100: base.luminance(0.88).hex(),
    200: base.luminance(0.75).hex(),
    300: base.luminance(0.60).hex(),
    400: base.luminance(0.45).hex(),
    500: base.hex(),                    // ← brand color anchor
    600: base.luminance(0.28).hex(),
    700: base.luminance(0.18).hex(),
    800: base.luminance(0.10).hex(),
    900: base.luminance(0.05).hex(),
    950: base.luminance(0.02).hex(),
  }
}
```

---

## Dark Mode Pair Generation (Atlassian + GitHub Primer)

Atlassian's rule: don't just invert. Map semantic tokens to different palette steps.

```json
{
  "color.background.primary": {
    "light": "palette.blue.100",
    "dark":  "palette.blue.900"
  },
  "color.text.primary": {
    "light": "palette.neutral.900",
    "dark":  "palette.neutral.100"
  },
  "color.border.default": {
    "light": "palette.neutral.300",
    "dark":  "palette.neutral.700"
  }
}
```

**Contrast check before shipping:**
```javascript
import chroma from 'chroma-js'
const ratio = chroma.contrast(textColor, bgColor)
if (ratio < 4.5) throw new Error(`WCAG AA fail: ${ratio}`)
```

---

## Dominant Color Extraction (color-thief pattern)

```javascript
// Extract 5-color palette from any image
import ColorThief from 'colorthief'
const thief = new ColorThief()
const img = document.querySelector('img')
const palette = thief.getPalette(img, 5)  // [[r,g,b], ...]

// Convert to hex + check contrast vs white/black
palette.map(([r,g,b]) => ({
  hex: chroma(r,g,b).hex(),
  onDark: chroma.contrast(chroma(r,g,b), '#000') >= 4.5,
  onLight: chroma.contrast(chroma(r,g,b), '#fff') >= 4.5,
}))
```

---

## Gradient Smoothing (framer/motion-palette)

```css
/* ❌ Banding visible — linear RGB */
background: linear-gradient(to right, #ff0000, #0000ff);

/* ✅ Smooth — use multiple stops in perceptual space */
background: linear-gradient(
  to right,
  oklch(60% 0.25 30),
  oklch(60% 0.25 90),
  oklch(60% 0.25 150),
  oklch(60% 0.25 210),
  oklch(60% 0.25 270)
);
```

---

## Programming Language Color References (GitHub Primer)

```json
{
  "JavaScript": "#f1e05a",
  "TypeScript": "#3178c6",
  "Python":     "#3572A5",
  "Rust":       "#dea584",
  "Go":         "#00ADD8",
  "CSS":        "#563d7c"
}
```

Source: primer/github-colors — use these exact values for language badges.

---

## Anti-Pattern Checklist

```
❌ Interpolating gradients in RGB/HSL (use LCH/OKLAB)
❌ Dark mode = just adding opacity or brightness filter
❌ WCAG contrast not verified before shipping palette
❌ Using random color names not from meodai/color-names standard
❌ Generating palette steps by gut feel rather than luminance math
```

---
name: brutalist-ui
description: >
  Apply industrial brutalism or tactical telemetry aesthetic to UI.
  Use when user asks for "brutalist design", "raw industrial look",
  "terminal/military aesthetic", "no-nonsense UI", "mechanical feel",
  "Swiss grid design", "monochrome data interface", or "CRT terminal style".
  Do NOT use for consumer apps or warm/friendly interfaces — this is for
  data-dense, austere, or editorial contexts only.
origin: adapted:taste-skill
license: MIT © 2026 Leonxlnx
version: 1.0.0
compatibility: "Web (CSS/Tailwind). Two modes: Swiss Industrial (light) or Tactical Telemetry (dark)."
---

<!-- Adapted from taste-skill brutalist-skill (MIT © 2026 Leonxlnx). Changes: added YAMTAM fields, added mode-select protocol, condensed layout rules. -->

## When to Use

- Use when: dashboard, admin panel, dev tool, terminal-like interface
- Use when: user explicitly names brutalism or industrial aesthetic
- Use when: data density matters more than warmth
- Do NOT use: consumer mobile apps, e-commerce, anything with a "friendly" brand

## Step 0 — Pick ONE mode, commit to it

```
Mode A: Swiss Industrial Print (light)
  Background: off-white (#F5F5F0)
  Text: carbon black (#1A1A1A)
  Accent: hazard red (#CC2200) — one element only

Mode B: Tactical Telemetry (dark)
  Background: near-black CRT (#0D0D0D)
  Text: phosphor white (#E8E8E0)
  Accent: hazard red (#CC2200) OR terminal green (#00FF41) — one, not both
```

Never mix modes within a single interface.

## Typography Rules

**Headers (macro):** Ultra-condensed heavy sans-serif. Inter Black, Neue Haas Grotesk, or Barlow Condensed.
- Letter-spacing: −0.04em to −0.06em
- Scale: large and aggressive — use fluid `clamp()` sizing
- Uppercase or small-caps for category labels

**Data/metadata (micro):** Fixed-width monospace only. JetBrains Mono, IBM Plex Mono.
- ALL CAPS with +0.08em tracking
- No serif fonts except as deliberate, heavily-degraded display elements

## Layout Rules

```
✓ Absolute corners — border-radius: 0 always. No exceptions.
✓ Visible 1–2px borders compartmentalizing every zone
✓ Grid-based layout — CSS Grid with explicit named areas
✓ Oscillate between dense data clusters and vast negative space
✓ Horizontal rules and vertical dividers carry structural weight
✗ No gradients
✗ No decorative shadows
✗ No rounded anything
✗ No color fills — white/off-white/near-black only (accent once)
```

## Analog Degradation (optional, Mode B only)

Add hardware simulation for CRT authenticity:
```css
/* Scanline overlay */
.scanlines::after {
  content: '';
  background: repeating-linear-gradient(
    0deg, transparent, transparent 2px,
    rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px
  );
  pointer-events: none;
  inset: 0; position: fixed;
}
/* Phosphor glow on key values */
.telemetry-value { text-shadow: 0 0 8px rgba(0,255,65,0.4); }
```

## Forbidden Patterns

```
✗ border-radius on any element
✗ More than one accent color visible at once
✗ Gradient backgrounds or fills
✗ Soft box shadows
✗ System UI fonts (Inter, Roboto, SF Pro) for primary display
✗ Mixed modes (light sections inside dark layout)
✗ Decorative icons without data function
```

## Anti-Fake-Pass

```
❌ Adding border-radius "just a little" (2px counts as a violation)
❌ Using two accent colors simultaneously
❌ Switching modes mid-scroll
✅ Verify: one mode, zero border-radius, one accent color
✅ Read every border-radius value: must all be 0
```

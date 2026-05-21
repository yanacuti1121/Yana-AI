---
name: aesthetic-anchor
description: >
  Lock a specific visual aesthetic before building UI — choose one of 8 design
  anchors (Swiss, Industrial, Brutalist, Aurora Maximalism, Chaotic Maximalism,
  Retro-Futuristic, Organic, Lo-Fi) and apply its palette, typography, and
  texture tokens consistently throughout the build.
  Use when the user says "make it look like X", names a visual style, wants a
  specific aesthetic mood, or asks to avoid generic AI output.
  Do NOT use when the project already has an established design system — apply
  that system instead.
origin: adapted:frontend-design
license: MIT © 2026 Ilm-Alan
version: 1.0.0
compatibility: "Any frontend stack. CSS custom properties output by default."
---

<!-- Adapted from Ilm-Alan/frontend-design (MIT). Changes: added YAMTAM origin/Anti-Fake-Pass/
     compatibility fields, structured as pre-build gate not post-build audit, added "Do NOT use when". -->

## When to Use

- Use when: user picks a style ("brutalist", "minimal", "dark tech", "earthy")
- Use when: user says "I want it to feel like [brand/era/mood]"
- Use when: starting a new UI with no existing design system
- Use when: user says "not generic", "not boring", "not AI-looking"
- Do NOT use when: project has a design system — use `ui-redesign` instead
- Do NOT use when: multiple anchors are active simultaneously — pick one and stick to it

## The 8 Anchors

Pick exactly one. Apply it fully before writing any component code.

---

### Swiss
> Grid structure, typographic precision, confident whitespace.

```
Background : #FFFFFF (pure white)
Text       : #000000
Accent     : Swiss Red (#EF3340) or International Orange (#FF4F00)
Font       : Akzidenz-Grotesk / Helvetica Neue / Söhne — weights 400 + 700
Grid       : visible column grid, strong baseline rhythm
Shadow     : none
Radius     : 0px
```

Rules: alignment is the decoration. Never center body text. Grid lines may be visible.

---

### Industrial
> Monospace, single signal color, uncompromising flatness.

```
Background : #000000 (pitch black)
Text       : #E5E5E5
Accent     : one semantic color only (e.g. #00FF41 for active state)
Font       : IBM Plex Mono / JetBrains Mono — weights 400 + 700
Shadow     : none
Radius     : 0px
Decoration : none — no gradients, no textures
```

Rules: every element either does something or does not exist.

---

### Brutalist
> Raw, confrontational, system fonts, hard shadows.

```
Background : #FFFFFF or #000000
Text       : opposite of background
Accent     : pure primary (#FF0000, #0000FF, #FFFF00)
Font       : Times New Roman / Helvetica / Courier New (native system fonts)
Shadow     : hard offset box-shadow: 4px 4px 0 #000 (no blur)
Radius     : 0px
Border     : 2px solid #000
```

Rules: intentional ugliness is a valid choice. Hover = color invert.

---

### Aurora Maximalism
> Dark + saturated + glowing. Maximum richness.

```
Background : dark saturated gradient (#0a0a1a → #1a0a2e)
Text       : #FFFFFF
Accent     : neon (choose one: #FF006E / #00F5FF / #ADFF2F)
Font       : Inter (display) + PP Neue Machina (headlines)
Texture    : mesh gradient overlay, subtle noise
Glow       : box-shadow: 0 0 20px <accent-color>40
Radius     : 12–16px
```

Rules: one dominant neon. Everything else is dark neutral.

---

### Chaotic Maximalism
> Conflicting colors, mixed typefaces, maximum energy.

```
Background : patterned or clashing pastels
Text       : varies by section — no single text color
Accent     : multiple (pastels + neons in same view is intentional)
Font       : mix 2–3 typefaces — display, serif, and monospace together
Layout     : intentional overflow, rotated elements, oversized type
```

Rules: chaos must be deliberate. Every odd choice has a reason.

---

### Retro-Futuristic
> 80s/90s sci-fi. CRT. Neon on black.

```
Background : #000000
Text       : #00FF00 / #00FFFF / #FF00FF
Accent     : same palette, pick dominant
Font       : VT323 / Orbitron / Space Mono / Monoton
Effects    : CRT scanlines (repeating-linear-gradient overlay), chromatic aberration on hover
Border     : 1px solid <accent>
Glow       : text-shadow: 0 0 8px <accent>
```

Rules: every interactive element should feel like it belongs in a 1987 terminal.

---

### Organic
> Earth, grain, warmth. Nature-inspired restraint.

```
Background : #F5F0E8 (warm off-white) / sage / linen
Text       : #2C2416 (dark warm brown)
Accent     : terracotta (#C4683C) / ochre (#D4A843) / sage (#6B8F71)
Font       : humanist serif (Lora, Playfair, Source Serif) + warm sans (Nunito, Raleway)
Texture    : subtle grain overlay (noise SVG or CSS filter)
Radius     : 8–24px (generous rounding)
Shadow     : warm-tinted, low spread
```

Rules: nothing should feel digital. Grain is mandatory.

---

### Lo-Fi
> Paper aesthetic. Imperfection is the point.

```
Background : #F5E6C8 (paper yellow)
Text       : #2B1D0E (ink brown)
Font       : mixed system fonts — intentional inconsistency
Decoration : halftone dots, Risograph misregistration (offset shadows in 2 colors)
Layout     : slight rotations (transform: rotate(-1deg) to rotate(1.5deg))
Border     : hand-drawn style (SVG borders or border-image)
```

Rules: everything should look like it was printed on a photocopier.

---

## How It Works

1. **Confirm the anchor** — ask if not stated. Show the 8 options as a menu.
2. **Apply tokens globally** — set CSS custom properties at `:root` before writing any component
3. **Build components using anchor tokens only** — no ad-hoc color or font values outside the system
4. **Flag deviations** — if a component requires breaking the anchor, note it explicitly

## Output Format

```css
/* Anchor: [name] */
:root {
  --color-bg: ...;
  --color-text: ...;
  --color-accent: ...;
  --font-display: ...;
  --font-body: ...;
  --radius: ...;
  --shadow: ...;
}
```

Then: component code using these tokens only.

## Gotchas

- Never apply two anchors at once — hybrid aesthetics collapse into generic
- Organic and Lo-Fi require a texture layer — don't skip it, the grain is load-bearing
- Retro-Futuristic scanlines must be a CSS overlay, not an image (performance)
- Aurora Maximalism with more than one neon color becomes generic — pick one
- Brutalist hard shadows must have 0 blur radius — `4px 4px 0 #000` not `4px 4px 4px #000`

## Anti-Fake-Pass Rules

Before claiming the aesthetic is applied, you MUST show:
- [ ] The anchor name explicitly stated
- [ ] `:root` CSS custom properties block shown
- [ ] At least one component using the tokens (not hardcoded values)
- [ ] Deviations from anchor noted if any were necessary

Reference: `gates/anti-fake-pass-gate.md`

---
description: Color token rules — shared paths with typography-rules.md, anti-ai-slop-design-law.md, and frontend-production-checklist.md so companion frontend rules always load together
paths: ["**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte", "**/*.css", "**/*.scss", "**/*.html"]
---

# Yana AI — Color Rules
# Source: radix-ui/colors (12-scale system) + tailwindlabs/tailwindcss (theme.css)

**Status:** Active  
**Enforced by:** UI Quality Gate L5, frontend agents  
**Companion skills:** `design-system-gen`, `accessibility-audit`, `aesthetic-anchor`
**Companion rules:** `anti-ai-slop-design-law.md` — the AI-default warm-neutral
background trap and other palette clichés this file's token rules don't catch;
`frontend-production-checklist.md` — dark-mode tonal layering, gray-on-color,
and other practical color extensions

---

## The 12-Scale Model (Radix UI)

Every color has 12 semantic steps. Agents MUST use semantic roles, not raw numbers.

```
Scale  Role                  Use
1      App background        Page background
2      Subtle background     Sidebar, card background
3      UI element bg         Input, inactive control
4      Hovered UI element    Hover state of 3
5      Active / selected     Active state, selected item
6      Subtle border         Dividers, separators
7      UI element border     Input border, focus ring
8      Hovered border        Border hover state
9      Solid backgrounds     Badges, tags, filled buttons — primary brand color
10     Hovered solid bg      Hover state of 9
11     Low-contrast text     Placeholder, disabled text, captions
12     High-contrast text    Body text, headings
```

```css
/* Wire Radix semantic steps to CSS variables */
:root {
  /* Example: blue palette */
  --color-bg:          var(--blue-1);
  --color-bg-subtle:   var(--blue-2);
  --color-border:      var(--blue-6);
  --color-border-strong: var(--blue-7);
  --color-solid:       var(--blue-9);
  --color-solid-hover: var(--blue-10);
  --color-text-muted:  var(--blue-11);
  --color-text:        var(--blue-12);
}
```

---

## Tailwind Color Policy

Use Tailwind's mathematical color ramps — never invent custom hex values.

| Shade | Typical use |
|---|---|
| 50–100 | Backgrounds, tints |
| 200–300 | Borders, dividers |
| 400–500 | Disabled states, muted text |
| 600–700 | Interactive elements, solid fills |
| 800–900 | Body text, headings (light mode) |
| 950 | Near-black headings, dark UI backgrounds |

```
✅ text-slate-900    ← from Tailwind ramp
✅ bg-blue-600       ← from Tailwind ramp
❌ text-[#1a1a2e]    ← arbitrary hex — REJECTED unless in design token
❌ bg-[#f3f4f6]      ← arbitrary hex — use bg-gray-100 instead
```

---

## Semantic Token Naming (Required in all projects)

```css
/* Required token set — agents must use these, not raw color values */
:root {
  /* Backgrounds */
  --color-background:        hsl(0 0% 100%);         /* page */
  --color-background-subtle: hsl(210 20% 98%);       /* cards, panels */

  /* Foregrounds */
  --color-foreground:        hsl(222 47% 11%);       /* primary text */
  --color-muted-foreground:  hsl(215 16% 47%);       /* secondary text */

  /* Interactive */
  --color-primary:           hsl(221 83% 53%);       /* brand */
  --color-primary-hover:     hsl(221 83% 45%);
  --color-primary-foreground: hsl(0 0% 100%);

  /* Feedback */
  --color-destructive:       hsl(0 84% 60%);
  --color-success:           hsl(142 71% 45%);
  --color-warning:           hsl(38 92% 50%);

  /* Borders */
  --color-border:            hsl(214 32% 91%);
  --color-ring:              hsl(221 83% 53%);       /* focus ring */
}

.dark {
  --color-background:        hsl(222 84% 5%);
  --color-background-subtle: hsl(222 47% 9%);
  --color-foreground:        hsl(210 40% 98%);
  --color-muted-foreground:  hsl(215 20% 65%);
  --color-border:            hsl(217 33% 17%);
}
```

---

## Contrast Requirements (WCAG AA minimum)

```
Normal text (< 18px / < 14px bold):   contrast ratio ≥ 4.5:1
Large text  (≥ 18px or ≥ 14px bold):  contrast ratio ≥ 3:1
UI components, icons:                  contrast ratio ≥ 3:1
```

```
Radix scale 12 on scale 1 background = always passes AA (by design)
Radix scale 11 on scale 1 background = passes AA for large text
Radix scale 9 as solid button text:   verify manually (varies by hue)

Tool: https://webaim.org/resources/contrastchecker/
      Or: npx @accessibilitychecker/cli contrast <hex1> <hex2>
```

---

## Hard Rules (non-negotiable)

```
❌ REJECT: hardcoded hex, rgb(), or hsl() colors NOT in design token map
❌ REJECT: color used as the ONLY indicator of state (red text = error, but also need icon/label)
❌ REJECT: text on colored background without checking contrast ratio
❌ REJECT: dark mode not defined — if light mode tokens exist, dark mode is required
❌ REJECT: white (#fff) or black (#000) raw values — use semantic tokens
❌ REJECT: 3 or more accent colors visible simultaneously in a single view
❌ REJECT: shadows using grey (rgba(0,0,0,...)) — use brand-tinted shadows
```

---

## Agent Enforcement

Before an agent delivers any frontend component with colors:
- [ ] All color values reference CSS variables or Tailwind semantic tokens — no raw hex
- [ ] Dark mode counterparts defined for every light mode token
- [ ] Text/background combinations verified for 4.5:1 contrast (or noted as large text)
- [ ] No more than 1 accent color per view (2 max for deliberate palette choices)
- [ ] Focus ring uses `--color-ring` variable — visible in both light and dark mode
- [ ] Shadows use brand-tinted color-mix, not grey `rgba(0,0,0,x)`

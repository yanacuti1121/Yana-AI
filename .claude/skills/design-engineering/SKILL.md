---
name: design-engineering
description: >
  Practice the design-engineering discipline — bridging design intent and
  implementation, working directly in code, component exploration workflow,
  design tool to code handoff, and building UI systems that stay true to
  their design spec. Use when asked about "design engineering", "design
  engineer", "design in code", "design-to-dev handoff", "bridge design
  and development", "design system in code", "component playground", "Storybook
  for design", "Figma to code", "interactive prototyping in code", or
  "when to use design tools vs code". Do NOT use for: building an actual
  design system token spec — see design-system-gen. Do NOT use for:
  specific animation implementation — see motion-design.
origin: adapted:MIT © emilkowalski
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "React, Storybook v8, Radix UI. Principles are framework-agnostic."
---

## When to Use

- Use when: design files don't match what's built and nobody notices until demo
- Use when: component variants are inconsistently implemented across pages
- Use when: you need to decide whether to prototype in Figma or code
- Use when: building a component that needs to feel exactly right before shipping
- Do NOT use for: WCAG audit — see accessibility-audit
- Do NOT use for: animation performance — see fixing-motion-performance

---

## What Design Engineering Is

```
Designer  ──────────────────►  Developer
(intent)   handoff gap lost      (implementation)

Design Engineer:
  ─ Thinks in both intent and constraints simultaneously
  ─ Makes decisions in code that designers make in tools
  ─ Builds components that look exactly like the design — by choice, not accident
  ─ Knows which details matter (spacing, timing, interaction states)
    and which can be deferred
```

**The gap isn't skill — it's communication.** Design engineers speak both languages fluently enough to close it themselves.

---

## When to Design in Code vs Design Tool

| Situation | Tool |
|---|---|
| Exploring layout and whitespace | Figma / design tool |
| Defining color, typography, brand | Design tool |
| Static screens for stakeholder review | Design tool |
| Micro-interactions and timing | Code (too slow in Figma) |
| Responsive behavior | Code |
| Complex states (loading, error, empty) | Code |
| Accessibility (focus, keyboard) | Code — can't test in Figma |
| Final production component | Code |

---

## Component Exploration Workflow

```
1. Start with the happy path — render one complete state in isolation
2. Add all variant states: default / hover / active / disabled / loading / error
3. Test with real content: long strings, empty strings, missing images, RTL
4. Add motion last — wire timing and spring after all states are correct
5. Audit in isolation (Storybook) before integrating into a page
```

---

## Storybook as Design-Engineering Playground

```tsx
// Button.stories.tsx — document all states designers care about
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  component: Button,
  argTypes: {
    variant: { control: 'select', options: ['default', 'destructive', 'ghost', 'outline'] },
    size:    { control: 'select', options: ['sm', 'default', 'lg', 'icon'] },
    disabled:{ control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="default">Primary</Button>
      <Button variant="outline">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Delete</Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};

// Show loading state explicitly — designers need to approve it
export const Loading: Story = {
  render: () => <Button loading>Saving...</Button>,
};
```

---

## Precision Handoff — Checklist

```
Before calling a component "done", verify:
  □ Spacing matches spec exactly (use 4/8pt grid — not "looks about right")
  □ All interactive states are implemented: default, hover, focus, active, disabled
  □ Loading and error states exist — not just happy path
  □ Empty state matches design intent (not "no items" in system default)
  □ Component handles long content gracefully (truncation, wrapping)
  □ Responsive breakpoints match design breakpoints
  □ Dark mode tokens used — not hardcoded colors
  □ Component is accessible: keyboard operable, screen reader tested
  □ Animation timing matches design spec (or is explicitly adjusted and approved)
```

---

## Pixel Precision Techniques

```tsx
// Measure against design with opacity overlay
// In DevTools: set element opacity to 0.5, screenshot from Figma underneath

// 8pt grid — space in multiples of 8 (or 4 for fine-grain)
const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48, '3xl': 64 };

// Line-height as a multiplier (not px) — scales with font size
h1 { font-size: 2.5rem; line-height: 1.2; }   /* = 48px line height at 40px font */

// Optical alignment — sometimes visual center ≠ geometric center
.icon-in-button {
  margin-top: -1px;    /* icons often sit 1px low optically */
}
```

---

## Design Token Consumption (Not Creation)

```tsx
// Use tokens, don't create them — design engineer consumes the system
// ✅ Use semantic tokens
className="text-foreground bg-background border-border"

// ❌ Invent new one-off values
style={{ color: '#1a1a2e', background: '#f8f9fa' }}

// When a value doesn't exist in tokens: bring it to the design system discussion
// Don't add it unilaterally — it creates drift
```

---

## Anti-Fake-Pass Rules

Before claiming design engineering work is done, you MUST show:
- [ ] All states implemented: default, hover, focus, active, disabled, loading, error
- [ ] Component runs in Storybook (or equivalent) with all states visible
- [ ] Spacing uses 4/8pt grid — no arbitrary pixel values
- [ ] No hardcoded color values — only design tokens
- [ ] Long content tested: long labels, empty content, missing images
- [ ] Responsive tested at all design breakpoints (not just desktop)
- [ ] Accessibility tested: keyboard navigation + screen reader pass

Reference: `gates/anti-fake-pass-gate.md`

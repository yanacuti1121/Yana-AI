---
name: enterprise-design-systems
description: Enterprise-grade component architecture patterns from 20 production design systems. Component naming, data-dense layouts, headless patterns, accessible forms, and dev-tool UI conventions. Sources: IBM Carbon, Adobe React Spectrum, Palantir Blueprint, GitHub Primer, Microsoft Fluent, Salesforce, Workday Canvas, Twilio Paste, Pinterest Gestalt, and 11 others.
origin: yamtam-engine — synthesized from adobe/react-spectrum, workday/canvas-kit, salesforce/design-system, carbon-design-system/carbon-components, palantir/blueprint, twilio/paste, ecomfe/echarts, pinterest/gestalt, skyscanner/backpack, hashicorp/flightdeck, kickstarter/wistful, basecamp/trix, necolas/react-native-web, segmentio/evergreen, zendeskgarden/react-components, github/primer, microsoft/fluentui, grommet/grommet, guardian/csnx, reakit/reakit
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.36
---

# /enterprise-design-systems

## When to Use

- Building B2B SaaS, admin panels, or data-dense dashboards
- Establishing component naming conventions for a design system
- Auditing component accessibility or keyboard navigation
- "This component library feels inconsistent across teams"

## Do NOT use for

- Consumer marketing pages (different visual language)
- Prototypes with < 10 components

---

## Component Naming Conventions (BEM + Carbon/Primer hybrid)

```
Block:     cds-button, pds-tag, primer-avatar
Element:   cds-button__icon, pds-tag__label
Modifier:  cds-button--primary, cds-button--sm, cds-button--loading
State:     is-disabled, is-loading, has-error
```

**Rules (IBM Carbon + Salesforce):**
- Block prefix = design system abbreviation (never generic)
- Modifiers describe intent, not appearance: `--destructive` not `--red`
- State classes start with `is-` or `has-` (never modify base class directly)

---

## Data-Dense Layout (Palantir Blueprint)

Blueprint's core principle: information density > whitespace aesthetics for power users.

```tsx
// Dense table with inline actions — Blueprint pattern
<Table numRows={100} columnWidths={[200, 120, 80, 60]}>
  <Column name="Name"   cellRenderer={renderName} />
  <Column name="Status" cellRenderer={renderStatus} />
  <Column name="Score"  cellRenderer={renderScore} />
  <Column name=""       cellRenderer={renderActions} />
</Table>

// Compact spacing tokens for dense UIs
--spacing-dense-xs: 2px;
--spacing-dense-sm: 4px;
--spacing-dense-md: 8px;
```

---

## Accessible Form Patterns (Workday Canvas + Zendesk Garden)

```tsx
// Every input MUST have: label, error, description linkage via aria-
<FormField>
  <Label htmlFor="email">Email address</Label>
  <Input
    id="email"
    aria-describedby="email-hint email-error"
    aria-invalid={!!error}
  />
  <Hint id="email-hint">We'll only use this for login</Hint>
  {error && <Error id="email-error" role="alert">{error}</Error>}
</FormField>
```

**Rules:** Label always visible (never placeholder-only). Error role="alert". Hint always present for complex fields.

---

## Headless Component Pattern (Reakit / React Aria)

```tsx
// Adobe React Spectrum — behavior separate from styling
import { useButton } from '@react-aria/button'

function Button({ children, ...props }) {
  const ref = useRef()
  const { buttonProps } = useButton(props, ref)
  return (
    <button {...buttonProps} ref={ref} className="my-button">
      {children}
    </button>
  )
}
// Keyboard nav, ARIA, focus management = handled by hook
// Visual styling = entirely yours
```

---

## Developer-Tool UI (GitHub Primer principles)

Primer's 4 rules for dev-tool interfaces:
1. **Monospace for code** — always, never serif/sans for code snippets
2. **Muted palette** — neutral grays dominate, color = signal only
3. **High information density** — padding ≤ 8px in compact views
4. **Keyboard first** — every action reachable without mouse

```css
/* Primer compact mode */
.primer-compact { --base-size-4: 2px; --base-size-8: 4px; }
```

---

## Chart/Viz Component (ECharts + Grommet)

```javascript
// ECharts — always set explicit dimensions, never rely on container
const chart = echarts.init(container, null, {
  width: 600, height: 400,
  renderer: 'svg'  // SVG for accessibility, Canvas for 10k+ points
})

// Grommet DataChart — declarative data binding
<DataChart
  data={data}
  series={['date', { property: 'amount', label: 'Revenue' }]}
  chart={[{ property: 'amount', type: 'line', thickness: 'xsmall' }]}
  guide={{ x: { granularity: 'coarse' }, y: { granularity: 'fine' } }}
/>
```

---

## Rich Text Editor (Basecamp Trix architecture)

```
Trix stores content as a document model, not HTML string.
Never store raw HTML — store structured attachments + string content.
Render via trix-content class for consistent output styling.
```

---

## Anti-Pattern Checklist

```
❌ Modifier class describes color: --red, --blue (use --error, --primary)
❌ Form input without visible label
❌ Interactive component without keyboard support
❌ Chart with pixel dimensions hardcoded in CSS (not component props)
❌ Rich text storing raw HTML strings
❌ Dense data UI using consumer app spacing (> 16px padding)
```

---
name: component-layout-patterns
description: Production-grade component layout patterns. Dashboard grids, hero sections, masonry layouts, filter systems, and CSS-only complex components. Sources: tailwindlabs/tailwindcss-ui, saas-ui, refactoringui samples, shadcn-ui/taxonomy, tabler, and 5 others.
origin: yamtam-engine — synthesized from tailwindlabs/tailwindcss-ui, saas-ui/saas-ui, creative-tim/material-kit, tabler/tabler, refactoringui/html-samples, shadcn-ui/taxonomy, lineicons/lineicons, modern-layout/patterns, vincenzocorona/pure-css-components, leandroercoli/ui-design-patterns
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.35
---

# /component-layout-patterns

## When to Use

- Building a SaaS dashboard, admin panel, or data-heavy UI
- Fixing layouts that "break" at certain viewport sizes
- Replacing JavaScript-dependent UI with CSS-only solutions
- "The sidebar/table/filter doesn't look right"

## Do NOT use for

- Marketing landing pages (different layout rules)
- Mobile-only apps with no desktop breakpoint

---

## SaaS Dashboard Layout (saas-ui + Tailwind)

```css
/* App shell — sidebar + main content */
.app-shell {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: 56px 1fr;
  grid-template-areas:
    "sidebar topbar"
    "sidebar content";
  height: 100vh;
}

@media (max-width: 768px) {
  .app-shell {
    grid-template-columns: 1fr;
    grid-template-areas: "topbar" "content";
  }
}
```

---

## Data Table Layout (Tabler pattern)

```html
<!-- Responsive table with horizontal scroll on mobile -->
<div class="table-responsive">
  <table class="table table-vcenter table-mobile-md card-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Status</th>
        <th class="text-end">Actions</th>
      </tr>
    </thead>
  </table>
</div>
```

```css
.table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; }
/* Stack columns on mobile */
@media (max-width: 576px) {
  .table-mobile-md td { display: block; border: 0; }
  .table-mobile-md td::before {
    content: attr(data-label);
    font-weight: 600;
    display: inline-block;
    width: 8rem;
  }
}
```

---

## Masonry Grid (Pinterest Gestalt)

```css
/* CSS-only masonry — supported in modern browsers */
.masonry {
  columns: 3 280px;
  column-gap: 1rem;
}
.masonry-item {
  break-inside: avoid;
  margin-bottom: 1rem;
}

/* JavaScript fallback for older browsers */
/* Use CSS grid with row span calculated by item height */
```

---

## Nested Filter + Search UI (shadcn-ui/taxonomy + leandroercoli)

```html
<!-- Filter system pattern: facets + active chips + results count -->
<div class="filter-shell">
  <div class="filter-sidebar">
    <!-- Facets: checkboxes grouped by category -->
  </div>
  <div class="filter-main">
    <div class="filter-bar">
      <SearchInput />
      <ActiveFilters />   <!-- chips showing applied filters -->
      <ResultCount />
    </div>
    <ResultsGrid />
  </div>
</div>
```

**Rules:**
- Active filters always visible above results
- Result count updates on every filter change (debounced 200ms)
- Clear All button appears when ≥ 1 filter active

---

## CSS-Only Components (vincenzocorona/pure-css-components)

```css
/* Accordion — no JavaScript */
.accordion input[type="checkbox"] { display: none; }
.accordion label { cursor: pointer; display: block; padding: 1rem; }
.accordion .content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 300ms var(--ease-out);
}
.accordion input:checked ~ .content { max-height: 500px; }

/* Dropdown — no JavaScript */
.dropdown:focus-within .dropdown-menu { display: block; }
.dropdown-menu { display: none; position: absolute; z-index: 100; }
```

---

## Flexbox Layout Tricks (modern-layout/patterns)

```css
/* Holy Grail layout without grid */
.holy-grail {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.holy-grail-body { display: flex; flex: 1; }
.holy-grail-content { flex: 1; }
.holy-grail-sidebar { flex: 0 0 240px; order: -1; }

/* Sticky footer — content pushes footer down */
.layout { display: flex; flex-direction: column; min-height: 100vh; }
.main   { flex: 1; }

/* Centering that actually works */
.center { display: grid; place-items: center; }
```

---

## Refactoring UI — "Before/After" Rules (refactoringui)

1. **Give every element more space than you think it needs** — start with 32px padding, not 8px
2. **Use fewer font sizes** — 3 sizes cover 90% of cases
3. **Don't use grey text on colored backgrounds** — use a tinted version of the background color
4. **Add visual weight to your primary action** — the CTA should be unmistakably primary
5. **Treat shadows as elevation, not decoration** — one elevation per depth level

---

## Icon System (lineicons)

```html
<!-- Stroke icons — no fill, consistent 1.5px stroke width -->
<svg class="icon icon-sm" aria-hidden="true">
  <use href="/icons/sprite.svg#arrow-right" />
</svg>
```

```css
.icon    { width: 1em; height: 1em; stroke-width: 1.5; }
.icon-sm { width: 1rem; height: 1rem; }
.icon-md { width: 1.25rem; height: 1.25rem; }
.icon-lg { width: 1.5rem; height: 1.5rem; }
/* Never scale icons with transform — use explicit size tokens */
```

---

## Anti-Pattern Checklist

```
❌ Fixed pixel widths on layout containers
❌ overflow: hidden on scrollable containers
❌ z-index > 100 without a z-index scale
❌ JavaScript accordion/dropdown when CSS-only works
❌ table for layout (only for tabular data)
❌ Icon sizes not from icon size token scale
❌ Filter UI without visible "active filters" state
```

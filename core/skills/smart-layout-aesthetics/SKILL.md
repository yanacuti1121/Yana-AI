---
name: smart-layout-aesthetics
description: Smart layout patterns and aesthetic engineering from 20 production repos. Shadcn command patterns, floating UI positioning, virtual lists, drag-and-drop, resizable panels, CSS container queries, masonry, aesthetic micro-details (shadows, borders, glass), and accessible overlay stacks. Sources: shadcn-ui/ui, radix-ui/primitives, floating-ui, cmdk, vaul, embla-carousel, dnd-kit, swapy, react-resizable-panels, tanstack/virtual, react-grid-layout, masonic, css-grid-layout-generator, clsx, tailwind-merge, cva, tailwindlabs/tailwindcss, unocss, vanilla-extract, open-props.
origin: yamtam-engine — synthesized from shadcn-ui/ui, radix-ui/primitives, floating-ui/floating-ui, pacocoursey/cmdk, emilkowalski/vaul, davidcetinkaya/embla-carousel, clauderic/dnd-kit, TahaSh/swapy, bvaughn/react-resizable-panels, TanStack/virtual, STRML/react-grid-layout, jaredLunde/masonic, nicowillis/css-grid-layout-generator, lukeed/clsx, nickmanning/tailwind-merge, joe-bell/cva, tailwindlabs/tailwindcss, antfu/unocss, vanilla-extract-css/vanilla-extract, argyleink/open-props
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.37
---

# /smart-layout-aesthetics

## When to Use

- Building command palettes, drawers, popovers, context menus
- Implementing virtual/windowed lists for 10k+ items
- Creating drag-and-drop with keyboard accessibility
- CSS container queries for component-level responsiveness
- Aesthetic micro-details: layered shadows, glass morphism, borders

## Do NOT use for

- Simple pages with < 5 interactive components
- Apps where bundle size is critical and heavy deps won't tree-shake

---

## Shadcn Command Pattern (cmdk)

```tsx
import { Command } from 'cmdk'

// cmdk pattern: separate data fetch from rendering
<Command>
  <Command.Input placeholder="Search commands..." />
  <Command.List>
    <Command.Empty>No results.</Command.Empty>
    <Command.Group heading="Actions">
      <Command.Item onSelect={() => run('deploy')}>Deploy</Command.Item>
      <Command.Item onSelect={() => run('rollback')}>Rollback</Command.Item>
    </Command.Group>
  </Command.List>
</Command>

// Keyboard: ↑↓ navigate, Enter select, Escape close — built in
// Add cmdk-dialog pattern for global ⌘K overlay
```

---

## Floating UI Positioning (floating-ui)

```javascript
import { computePosition, flip, shift, offset } from '@floating-ui/dom'

async function positionTooltip(anchor, tooltip) {
  const { x, y } = await computePosition(anchor, tooltip, {
    placement: 'top',
    middleware: [
      offset(8),          // gap between anchor and floating
      flip(),             // flip to bottom if no room above
      shift({ padding: 8 }) // keep inside viewport
    ],
  })
  Object.assign(tooltip.style, { left: `${x}px`, top: `${y}px` })
}

// Never use CSS position:fixed with manual math — use floating-ui
```

---

## Virtual List (TanStack Virtual)

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

function VirtualList({ items }) {
  const parentRef = useRef(null)
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,     // estimated row height in px
    overscan: 5,                // render 5 extra rows outside viewport
  })

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map(virtualRow => (
          <div key={virtualRow.index}
            style={{ transform: `translateY(${virtualRow.start}px)` }}>
            {items[virtualRow.index]}
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Drag-and-Drop (dnd-kit — keyboard accessible)

```tsx
import { DndContext, useSortable, arrayMove } from '@dnd-kit/sortable'

function SortableItem({ id }) {
  const { attributes, listeners, setNodeRef, transform } = useSortable({ id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      style={{ transform: CSS.Transform.toString(transform) }}>
      {id}
    </div>
  )
}
// attributes adds aria-roledescription, aria-describedby
// listeners adds keyboard: Space to pick up, arrows to move, Space to drop
```

---

## CSS Container Queries (component-level responsive)

```css
/* Component responds to its container, not viewport */
.card-container { container-type: inline-size; }

@container (min-width: 400px) {
  .card { flex-direction: row; }
  .card__image { width: 160px; flex-shrink: 0; }
}

@container (min-width: 600px) {
  .card { padding: 24px; gap: 16px; }
}

/* Combine with container names for nested components */
.sidebar { container: sidebar / inline-size; }
@container sidebar (min-width: 200px) { .nav-item span { display: block; } }
```

---

## Resizable Panels (react-resizable-panels)

```tsx
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'

<PanelGroup direction="horizontal" autoSaveId="editor-layout">
  <Panel defaultSize={25} minSize={15}>
    <Sidebar />
  </Panel>
  <PanelResizeHandle className="resize-handle" />
  <Panel minSize={30}>
    <Editor />
  </Panel>
</PanelGroup>
// autoSaveId persists user layout in localStorage
// Keyboard: focus handle → arrow keys to resize
```

---

## Aesthetic Micro-Details

```css
/* Layered shadows (not just one shadow) */
.card {
  box-shadow:
    0 1px 2px rgba(0,0,0,.04),
    0 4px 8px rgba(0,0,0,.06),
    0 12px 24px rgba(0,0,0,.08);
}

/* Glass morphism — only on colorful bg */
.glass {
  background: rgba(255,255,255,.12);
  backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255,255,255,.2);
}

/* Subtle inner border — 1px inset */
.button {
  box-shadow: inset 0 1px 0 rgba(255,255,255,.15);
}

/* Open Props: pre-computed shadow scale */
@import 'open-props/shadows';
.elevated { box-shadow: var(--shadow-3); }
```

---

## Class Variance Authority (shadcn pattern)

```typescript
import { cva } from 'class-variance-authority'

const button = cva('rounded font-medium transition', {
  variants: {
    intent:  { primary: 'bg-blue-600 text-white', ghost: 'bg-transparent' },
    size:    { sm: 'px-3 py-1 text-sm', md: 'px-4 py-2', lg: 'px-6 py-3' },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
})

// button({ intent: 'ghost', size: 'sm' }) → 'rounded font-medium ... bg-transparent px-3 py-1 text-sm'
// Compose with tailwind-merge to resolve conflicting classes
```

---

## Anti-Fake-Pass Checklist

```
❌ Tooltip/popover positioned with CSS top/left math (use floating-ui)
❌ Long list (> 200 items) rendered without virtualization
❌ Drag-and-drop without keyboard support (aria + Space/arrow keys)
❌ Container queries not guarded by container-type declaration
❌ Glass morphism on low-contrast or white background (invisible)
❌ Single box-shadow (use 3-layer system for depth perception)
❌ Panel resize without minSize (users can collapse to 0px)
```

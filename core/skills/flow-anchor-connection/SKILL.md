---
name: flow-anchor-connection
description: Visual flow connection patterns for generative UI agent workflows. jsPlumb anchor point architecture, connector routing, endpoint management, and dynamic flow diagram generation from agent pipeline state. Sources: jsplumb/jsplumb.
origin: yana-ai — synthesized from jsplumb/jsplumb (MIT), jsPlumb Community Edition
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /flow-anchor-connection

## When to Use

- Build interactive workflow editor for yamtam agent pipeline configuration
- Render agent-to-agent connections with drag-and-drop in a web UI
- Visualize live data flow between skills in a browser-based dashboard
- Generate connection diagrams from agent state JSON

## Do NOT use for

- Static diagrams without user interaction (use [[mermaid-diagram-generation]])
- Server-side rendering without DOM (jsPlumb requires browser environment)

---

## jsPlumb setup (vanilla JS)

```javascript
import { newInstance, AnchorLocations, ArrowOverlay } from '@jsplumb/browser-ui'

const instance = newInstance({
  container: document.getElementById('canvas'),
})

// Add nodes
const nodeA = document.getElementById('skill-proxy')
const nodeB = document.getElementById('skill-sandbox')

// Connect with an arrow
instance.connect({
  source: nodeA,
  target: nodeB,
  anchors:    [AnchorLocations.Bottom, AnchorLocations.Top],
  connector:  'Flowchart',
  overlays:   [{ type: 'Arrow', options: { width: 10, length: 10 } }],
  paintStyle: { stroke: '#2563eb', strokeWidth: 2 },
})

// Make node draggable
instance.manage(nodeA)
instance.manage(nodeB)
```

---

## Dynamic pipeline from JSON state

```javascript
function renderPipeline(stages: { id: string; label: string }[]) {
  const canvas = document.getElementById('pipeline-canvas')!

  // Create DOM nodes
  stages.forEach(({ id, label }, i) => {
    const el = document.createElement('div')
    el.id          = id
    el.textContent = label
    el.className   = 'pipeline-node'
    el.style.left  = `${50 + i * 200}px`
    el.style.top   = '100px'
    canvas.appendChild(el)
    instance.manage(el)
  })

  // Connect sequentially
  stages.forEach(({ id }, i) => {
    if (i === 0) return
    instance.connect({
      source: stages[i - 1].id,
      target: id,
      connector: 'Straight',
    })
  })
}

renderPipeline([
  { id: 'proxy',   label: 'tool-proxy.sh' },
  { id: 'sandbox', label: 'sandbox-exec.sh' },
  { id: 'audit',   label: 'audit-log' },
])
```

---

## Export connections as JSON

```javascript
function exportConnections(): object[] {
  return instance.getConnections().map(conn => ({
    source: conn.source.id,
    target: conn.target.id,
    type:   conn.connector?.type,
  }))
}
```

---

## Anti-Fake-Pass Checklist

```
❌ jsPlumb requires browser DOM — no Node.js/server-side rendering
❌ manage() not called → nodes not draggable even if connect() works
❌ Container element not positioned (relative/absolute) → connections render at (0,0)
❌ repaintEverything() not called after layout change → connectors don't follow nodes
❌ jsPlumb Community vs Toolkit: very different APIs — don't confuse
❌ SSR frameworks (Next.js) → import jsPlumb only in useEffect, not at module level
```

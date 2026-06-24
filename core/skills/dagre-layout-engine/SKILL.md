---
name: dagre-layout-engine
description: Directed acyclic graph layout computation for auto-positioning nodes. dagre coordinate assignment, edge routing, rank assignment, and integration with rendering libraries for skill/rule dependency graphs. Sources: dagrejs/dagre.
origin: yana-ai — synthesized from dagrejs/dagre (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /dagre-layout-engine

## When to Use

- Auto-compute (x, y) positions for yamtam skill dependency graph nodes
- Render agent hierarchy diagram without manual coordinate placement
- Generate layered layouts for rule gate topology (L0 → L5)
- Integrate with D3.js, React Flow, or SVG rendering for visual output

## Do NOT use for

- Force-directed layouts (use d3-force for organic graphs)
- Cyclic graphs (dagre requires DAG — directed *acyclic* graph)

---

## Compute layout for skill graph

```javascript
import dagre from 'dagre'

function layoutSkillGraph(
  skills: string[],
  deps:   [string, string][]   // [from, to] edges
): Map<string, { x: number; y: number; width: number; height: number }> {
  const g = new dagre.graphlib.Graph()

  g.setGraph({
    rankdir: 'TB',     // top-to-bottom layout
    nodesep: 30,       // horizontal separation between nodes
    ranksep: 50,       // vertical separation between ranks
    marginx:  20,
    marginy:  20,
  })

  g.setDefaultEdgeLabel(() => ({}))

  // Add nodes with dimensions
  for (const skill of skills) {
    g.setNode(skill, { label: skill, width: 180, height: 40 })
  }

  // Add edges
  for (const [from, to] of deps) {
    g.setEdge(from, to)
  }

  // Compute layout
  dagre.layout(g)

  // Extract positions
  const positions = new Map<string, { x: number; y: number; width: number; height: number }>()
  for (const node of g.nodes()) {
    positions.set(node, g.node(node))
  }
  return positions
}
```

---

## Defense gate topology layout

```javascript
const gateNodes = ['L0-audit', 'L1-evasion', 'L2-proxy', 'L3-container', 'L4-deps', 'L5-path']
const gateEdges: [string, string][] = [
  ['L0-audit', 'L1-evasion'],
  ['L1-evasion', 'L2-proxy'],
  ['L2-proxy', 'L3-container'],
  ['L3-container', 'L4-deps'],
  ['L4-deps', 'L5-path'],
]

const positions = layoutSkillGraph(gateNodes, gateEdges)
// Render SVG using computed positions
for (const [node, pos] of positions) {
  console.log(`${node}: x=${pos.x.toFixed(0)}, y=${pos.y.toFixed(0)}`)
}
```

---

## Export to SVG

```javascript
function toSvg(positions: Map<string, { x: number; y: number; width: number; height: number }>): string {
  const rects = [...positions.entries()].map(([label, { x, y, width, height }]) =>
    `<rect x="${x - width/2}" y="${y - height/2}" width="${width}" height="${height}" rx="4" fill="#f0f4f8" stroke="#888"/>
     <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="12">${label}</text>`
  ).join('\n')

  const maxX = Math.max(...[...positions.values()].map(p => p.x + p.width / 2)) + 20
  const maxY = Math.max(...[...positions.values()].map(p => p.y + p.height / 2)) + 20

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}">\n${rects}\n</svg>`
}
```

---

## Anti-Fake-Pass Checklist

```
❌ Cyclic edges → dagre hangs or throws — validate DAG before layout
❌ Node added after dagre.layout() → position = undefined
❌ rankdir:'LR' for deep trees → horizontal layout overflows viewport
❌ No width/height on nodes → dagre uses 0×0 → nodes overlap
❌ Edge label not set (setDefaultEdgeLabel missing) → graphlib throws
❌ g.node() returns undefined for nodes not in graph — check g.hasNode() first
```

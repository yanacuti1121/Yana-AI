---
name: graph-data-structure-ops
description: Pure graph data structure operations: adjacency list, BFS/DFS traversal, cycle detection, topological sort, and shortest path. For dependency resolution in skill/rule graphs without external DB. Sources: bpesquet/graph-data-structure.
origin: yamtam-engine — synthesized from bpesquet/graph-data-structure (MIT), CLRS graph algorithms
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /graph-data-structure-ops

## When to Use

- Build skill/rule dependency graph and detect circular dependencies
- Topological sort to determine safe execution order for agent tasks
- BFS to find all skills reachable from a given entry point
- Shortest dependency path between two skills for impact analysis

## Do NOT use for

- Large graphs > 10k nodes (use specialized graph DB like Neo4j)
- Visual layout (use [[dagre-layout-engine]] for rendering)

---

## Graph implementation

```typescript
class Graph<T> {
  private adj: Map<T, Set<T>> = new Map()
  private directed: boolean

  constructor(directed = true) { this.directed = directed }

  addNode(n: T):              void { if (!this.adj.has(n)) this.adj.set(n, new Set()) }
  addEdge(from: T, to: T):    void { this.addNode(from); this.addNode(to); this.adj.get(from)!.add(to); if (!this.directed) this.adj.get(to)!.add(from) }
  neighbors(n: T):            T[]  { return [...(this.adj.get(n) ?? [])] }
  nodes():                    T[]  { return [...this.adj.keys()] }
  hasEdge(from: T, to: T):    boolean { return !!this.adj.get(from)?.has(to) }

  // BFS — all reachable nodes from start
  bfs(start: T): T[] {
    const visited = new Set<T>([start])
    const queue   = [start]
    const order:   T[] = []
    while (queue.length) {
      const node = queue.shift()!
      order.push(node)
      for (const nb of this.neighbors(node)) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb) }
      }
    }
    return order
  }

  // Topological sort (Kahn's algorithm)
  topoSort(): T[] | null {
    const inDeg = new Map<T, number>()
    for (const n of this.nodes()) inDeg.set(n, 0)
    for (const n of this.nodes()) for (const nb of this.neighbors(n)) inDeg.set(nb, (inDeg.get(nb) ?? 0) + 1)

    const queue = this.nodes().filter(n => inDeg.get(n) === 0)
    const result: T[] = []

    while (queue.length) {
      const n = queue.shift()!
      result.push(n)
      for (const nb of this.neighbors(n)) {
        const d = (inDeg.get(nb) ?? 1) - 1
        inDeg.set(nb, d)
        if (d === 0) queue.push(nb)
      }
    }

    return result.length === this.nodes().length ? result : null  // null = cycle detected
  }

  // Cycle detection
  hasCycle(): boolean { return this.topoSort() === null }
}
```

---

## Skill dependency graph

```typescript
const skillGraph = new Graph<string>()
skillGraph.addEdge('vector-store-patterns',   'ndarray-vector-math')
skillGraph.addEdge('in-memory-vector-storage', 'vector-distance-metrics')
skillGraph.addEdge('llm-semantic-cache',        'vector-store-patterns')

const order = skillGraph.topoSort()
if (!order) throw new Error('Circular dependency in skill graph!')
console.log('Load order:', order)
```

---

## Anti-Fake-Pass Checklist

```
❌ topoSort returns null (cycle) but caller uses result without null check
❌ BFS on disconnected graph → only traverses connected component of start node
❌ Directed graph used as undirected → neighbors only one direction
❌ addEdge without addNode → Map.get returns undefined → TypeError
❌ Large graphs with string keys → Map lookup O(1) but string hashing overhead
```

---
name: graph-dependency-resolution
description: Graph algorithms and dependency resolution for AI agent systems. DAG construction for action gate ordering, cycle detection in skill/rule graphs, BFS/DFS traversal, semver range resolution for version conflicts, topological sort for execution ordering, and PageRank-based rule importance scoring. Sources: dagrejs/graphlib, trekhleb/javascript-algorithms, npm/node-semver, sindresorhus/toposort, asv/pagerank.
origin: yamtam-engine — synthesized from dagrejs/graphlib, trekhleb/javascript-algorithms, npm/node-semver, sindresorhus/toposort, asv/pagerank
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.46
---

# /graph-dependency-resolution

## When to Use

- "Which rule/skill depends on which — what's the safe load order?"
- Cycle detection: skill A depends on B depends on A → deadlock
- Semver range conflicts: two skills require different versions of the same package
- Rank rules by reference frequency to find the most critical ones
- Find shortest path between two gates (optimal middleware chain)

## Do NOT use for

- Linear ordered lists with no dependencies (just sort by priority number)
- Single-hop lookups (use a Map)

---

## DAG: Directed Acyclic Graph (graphlib)

```typescript
import { Graph, alg } from '@dagrejs/graphlib'

// Build the YAMTAM gate dependency graph
const gateGraph = new Graph({ directed: true, multigraph: false, compound: false })

// Nodes = gates/skills/rules
gateGraph.setNode('L0', { label: 'audit-log',         tier: 0 })
gateGraph.setNode('L1', { label: 'anti-evasion',       tier: 1 })
gateGraph.setNode('L2', { label: 'shell-sanitize',     tier: 2 })
gateGraph.setNode('L3', { label: 'network-egress',     tier: 3 })
gateGraph.setNode('tool-exec', { label: 'execute',     tier: 4 })

// Edges = "must run before"
gateGraph.setEdge('L0', 'L1')    // audit-log must be set up before anti-evasion
gateGraph.setEdge('L1', 'L2')
gateGraph.setEdge('L2', 'L3')
gateGraph.setEdge('L3', 'tool-exec')

// Cycle detection — returns [] if DAG is valid, lists cycle nodes if broken
const cycles = alg.findCycles(gateGraph)
if (cycles.length > 0) {
  throw new Error(`Dependency cycle detected: ${cycles.map(c => c.join('→')).join(', ')}`)
}

// Sources = nodes with no incoming edges (entry points)
const entryPoints = gateGraph.sources()   // ['L0']
// Sinks   = nodes with no outgoing edges (terminal nodes)
const terminals   = gateGraph.sinks()     // ['tool-exec']

// Reachability: all nodes reachable from L0
const reachable = alg.dijkstra(gateGraph, 'L0')
// reachable['tool-exec'].distance === 4

// Rule: always call alg.findCycles() before executing a gate graph — cycles = deadlock
// Rule: use gateGraph.sources() to find valid entry points, never hard-code 'L0'
```

---

## Cycle Detection + BFS/DFS (javascript-algorithms)

```typescript
// BFS — shortest path in unweighted graph (level by level)
function bfs(graph: Map<string, string[]>, start: string): Map<string, number> {
  const distances = new Map<string, number>([[start, 0]])
  const queue = [start]

  while (queue.length) {
    const node = queue.shift()!
    const neighbors = graph.get(node) ?? []

    for (const n of neighbors) {
      if (!distances.has(n)) {
        distances.set(n, distances.get(node)! + 1)
        queue.push(n)
      }
    }
  }
  return distances  // distances.get(target) = hop count from start
}

// DFS — cycle detection via visited + recursion stack
function hasCycle(graph: Map<string, string[]>): boolean {
  const visited     = new Set<string>()
  const inStack     = new Set<string>()

  function dfs(node: string): boolean {
    visited.add(node)
    inStack.add(node)

    for (const neighbor of graph.get(node) ?? []) {
      if (!visited.has(neighbor) && dfs(neighbor)) return true
      if (inStack.has(neighbor)) return true  // back edge = cycle
    }

    inStack.delete(node)
    return false
  }

  for (const node of graph.keys()) {
    if (!visited.has(node) && dfs(node)) return true
  }
  return false
}

// Dijkstra — weighted shortest path (e.g., skill load latency as weight)
function dijkstra(graph: Map<string, Array<{ to: string; weight: number }>>, start: string) {
  const dist = new Map<string, number>([[start, 0]])
  const pq: Array<{ node: string; d: number }> = [{ node: start, d: 0 }]

  while (pq.length) {
    pq.sort((a, b) => a.d - b.d)
    const { node, d } = pq.shift()!
    if (d > (dist.get(node) ?? Infinity)) continue

    for (const { to, weight } of graph.get(node) ?? []) {
      const newDist = d + weight
      if (newDist < (dist.get(to) ?? Infinity)) {
        dist.set(to, newDist)
        pq.push({ node: to, d: newDist })
      }
    }
  }
  return dist
}

// Rule: BFS for "minimum hops" questions, Dijkstra for weighted latency paths
// Rule: DFS inStack set must be reset on backtrack — missing this = false cycle reports
```

---

## Topological Sort: Execution Order (toposort)

```typescript
import toposort from 'toposort'

// Sort skills/scripts so dependencies run first
// Edge [A, B] means: A must run BEFORE B
const edges: [string, string][] = [
  ['validate-manifest',  'build-release'],
  ['run-tests',          'build-release'],
  ['lint',               'run-tests'],
  ['typecheck',          'run-tests'],
  ['install-deps',       'lint'],
  ['install-deps',       'typecheck'],
]

// toposort returns nodes in reverse dep order (last dep first)
const executionOrder = toposort(edges).reverse()
// ['install-deps', 'lint', 'typecheck', 'run-tests', 'validate-manifest', 'build-release']

// With explicit node list (for isolated nodes with no edges)
const allNodes = ['install-deps', 'lint', 'typecheck', 'run-tests', 'validate-manifest', 'build-release', 'notify']
const fullOrder = toposort.array(allNodes, edges).reverse()

// Rule: always .reverse() — toposort returns reverse topological order by default
// Rule: toposort throws 'Cyclic dependency' on cycle — catch it, report the chain
try {
  toposort(edges)
} catch (e) {
  if ((e as Error).message.includes('Cyclic')) {
    throw new Error(`Build order has circular dependency: ${(e as Error).message}`)
  }
}
```

---

## Semver Range Resolution (node-semver)

```typescript
import semver from 'semver'

// Check if a version satisfies a range
semver.satisfies('1.3.45', '>=1.3.0 <2.0.0')  // true
semver.satisfies('2.0.0',  '>=1.3.0 <2.0.0')  // false

// Find the best version from a list that satisfies a range
const versions = ['1.2.0', '1.3.0', '1.3.44', '2.0.0', '2.1.0']
semver.maxSatisfying(versions, '^1.3.0')   // '1.3.44'
semver.minSatisfying(versions, '^2.0.0')   // '2.0.0'

// Resolve conflicting ranges from multiple skills
function resolveConflicts(
  requirements: Array<{ skill: string; range: string }>
): string | null {
  // Find intersection: a version satisfying ALL ranges
  const intersection = requirements
    .map(r => semver.validRange(r.range))
    .filter(Boolean) as string[]

  // Try known versions against all constraints
  return semver.maxSatisfying(
    versions,
    intersection.join(' ')  // semver treats space as AND in ranges
  )
}

// Parse and compare
const v = semver.parse('1.3.45-beta.1')!
// v.major=1, v.minor=3, v.patch=45, v.prerelease=['beta', 1]

// Coerce messy version strings (e.g., from package.json non-standard values)
semver.coerce('v2.3.4-rc1')?.version  // '2.3.4'

// Rule: use semver.validRange() before storing user-supplied ranges — throws on invalid
// Rule: space-join = AND intersection; || = OR union — never mix accidentally
```

---

## PageRank: Rule Importance Scoring

```typescript
// Power iteration PageRank — find most-referenced rules/skills
// A rule with many inbound links from other rules = high importance

function pageRank(
  graph: Map<string, string[]>,   // node → outbound neighbors
  damping   = 0.85,
  iterations = 50,
  tolerance  = 1e-6
): Map<string, number> {
  const nodes = [...graph.keys()]
  const N     = nodes.length
  let ranks   = new Map(nodes.map(n => [n, 1 / N]))

  for (let i = 0; i < iterations; i++) {
    const next = new Map<string, number>()
    let delta = 0

    for (const node of nodes) {
      // Sum contributions from all nodes pointing to this one
      let sum = 0
      for (const [src, targets] of graph) {
        if (targets.includes(node)) {
          sum += (ranks.get(src) ?? 0) / targets.length
        }
      }
      const newRank = (1 - damping) / N + damping * sum
      next.set(node, newRank)
      delta += Math.abs(newRank - (ranks.get(node) ?? 0))
    }

    ranks = next
    if (delta < tolerance) break  // converged
  }

  return new Map([...ranks.entries()].sort((a, b) => b[1] - a[1]))
}

// Example: rank YAMTAM rules by cross-reference frequency
const ruleRefs = new Map([
  ['00-meta-rule-enforcer', ['agent-middleware-law', 'verification']],
  ['agent-middleware-law',  ['shell-sanitize-law', 'network-egress-law']],
  ['shell-sanitize-law',    ['00-meta-rule-enforcer']],
  ['network-egress-law',    ['00-meta-rule-enforcer', 'agent-middleware-law']],
  ['verification',          []],
])

const importance = pageRank(ruleRefs)
// '00-meta-rule-enforcer' ranks highest — most inbound links
// Use: prune rarely-referenced rules, highlight critical ones in docs

// Rule: damping=0.85 is Google's original value — do not change without reason
// Rule: convergence check (delta < tolerance) prevents over-iteration on small graphs
```

---

## Anti-Fake-Pass Checklist

```
❌ No cycle check before executing dependency graph (deadlock on first cycle)
❌ DFS without inStack set (can't distinguish visited from in-current-path)
❌ toposort result not .reverse()'d (execution order is backwards)
❌ semver.satisfies() on un-validated range string (throws on malformed range)
❌ Space-joined semver ranges confused with OR union (space = AND, || = OR)
❌ PageRank without convergence check (fixed iteration on large graphs = wrong)
❌ graphlib.alg.findCycles() skipped before graph traversal (silent infinite loop)
```

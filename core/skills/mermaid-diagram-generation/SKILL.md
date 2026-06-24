---
name: mermaid-diagram-generation
description: Generating system diagrams as Mermaid text from agent state. Flowcharts, sequence diagrams, state machines, Gantt charts, and ER diagrams — all rendered from plain text without a browser. Sources: mermaid-js/mermaid, mermaid-js/mermaid-cli.
origin: yana-ai — synthesized from mermaid-js/mermaid (MIT), mermaid-js/mermaid-cli
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /mermaid-diagram-generation

## When to Use

- Export agent workflow, skill dependency graph, or sandbox gate topology as SVG
- Auto-generate architecture diagrams from MANIFEST.json data
- Visualize agent hierarchy (87 agents, 5 tiers) for documentation
- Generate state machine diagrams from rule files

## Do NOT use for

- Interactive diagrams requiring user input (use jsplumb or React Flow)
- Real-time live data dashboards (use Grafana)

---

## Flowchart from agent pipeline

```javascript
function agentPipelineToMermaid(stages: string[]): string {
  const nodes = stages.map((s, i) => `  S${i}[${s}]`).join('\n')
  const edges = stages.slice(0, -1).map((_, i) => `  S${i} --> S${i+1}`).join('\n')
  return `flowchart LR\n${nodes}\n${edges}`
}

const diagram = agentPipelineToMermaid([
  'tool-proxy.sh', 'sanitize', 'sandbox-exec', 'audit-log'
])
/*
flowchart LR
  S0[tool-proxy.sh]
  S1[sanitize]
  S2[sandbox-exec]
  S3[audit-log]
  S0 --> S1
  S1 --> S2
  S2 --> S3
*/
```

---

## Defense gate topology

```
flowchart TB
  subgraph "Yamtam Defense Stack"
    L0[L0: Audit Hash-Chain]
    L1[L1: Anti-Evasion + Agency Law]
    L2[L2: tool-proxy.sh Sanitize]
    L3[L3: API Security + Container]
    L4[L4: Dependency + SLSA]
    L5[L5: Path Traversal Guard]
  end
  Agent --> L0 --> L1 --> L2 --> L3 --> L4 --> L5 --> Execute
```

---

## State machine diagram

```javascript
function rulesToStateDiagram(states: string[], transitions: [string, string, string][]): string {
  const trans = transitions.map(([from, label, to]) => `  ${from} --> ${to}: ${label}`).join('\n')
  return `stateDiagram-v2\n${trans}`
}
```

---

## CLI rendering to SVG (mermaid-cli)

```bash
# Install: npm install -g @mermaid-js/mermaid-cli
echo 'flowchart LR; A-->B-->C' > /tmp/diagram.mmd
mmdc -i /tmp/diagram.mmd -o /tmp/diagram.svg

# Batch render all diagrams in a directory
find /workspaces/yana-ai/docs -name '*.mmd' | while read -r f; do
  mmdc -i "$f" -o "${f%.mmd}.svg" --quiet
done
```

---

## Sequence diagram for agent comms

```
sequenceDiagram
  participant U as User
  participant P as tool-proxy.sh
  participant S as sandbox-exec.sh
  participant A as Agent
  U->>P: tool call
  P->>P: sanitize + mutate
  P->>S: exec in sandbox
  S->>A: run command
  A-->>S: result
  S-->>P: exit code
  P-->>U: audit log + result
```

---

## Anti-Fake-Pass Checklist

```
❌ Special characters in node labels ([](){}|) → syntax error; escape with quotes
❌ mermaid-cli requires Puppeteer → headless Chrome must be available
❌ Diagram > 2000 chars → mermaid-cli may timeout on complex graphs
❌ stateDiagram v1 syntax in v2 context → transitions render wrong
❌ No output file extension → CLI defaults to SVG but confuses downstream
❌ flowchart TB vs LR: direction matters for readability — TB for hierarchies, LR for pipelines
```

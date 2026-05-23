---
name: rewoo-plan-execute
description: ReWOO decoupled planning — Planner/Worker/Solver split. 5x fewer tokens than ReAct on HotpotQA, +4% accuracy. Plan-and-Execute generalization, planner distillation to 7B. When to use plan-first vs interleaved. Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yamtam-engine — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.54
---

# /rewoo-plan-execute

## When to Use

- Long-horizon tasks where ReAct's per-step context growth is unacceptable
- Tasks with parallel tool calls (evidence fetching for a research question)
- When you want a small planner model (7B) driving a big executor model
- Batch processing: plan once, execute N evidence steps in parallel

## Do NOT use for

- Tasks requiring mid-plan adaptation (use [[react-agent-loop]] or Plan-and-Execute with replanner)
- Short 1-3 step tasks where planning overhead exceeds savings
- Interactive back-and-forth flows where the goal evolves per-turn

---

## The three roles

```
Planner  : user_question → [plan_dag]          (one LLM call, big model or distilled 7B)
Workers  : [plan_dag]    → [evidence]           (N tool calls, can run in parallel)
Solver   : question + plan_dag + evidence → answer  (one LLM call)
```

**Why 5x fewer tokens:** ReAct re-sends all prior context on every step.
ReWOO pays: 1 planner prompt + N small worker prompts + 1 solver prompt.

---

## Plan DAG format

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class PlanNode:
    ref: str          # "#E1", "#E2" …
    tool: str         # tool name
    args: str         # argument string; may reference "#E1" for chaining
    deps: list[str]   # list of ref IDs this node depends on

def parse_plan(plan_text: str) -> list[PlanNode]:
    """
    Expected planner output format:
      Plan: I need to look up the population of Paris, then compute density.
      #E1 = search("population of Paris")
      #E2 = search("area of Paris in km2")
      #E3 = calculator(f"{#E1} / {#E2}")
    """
    import re
    nodes = []
    for line in plan_text.splitlines():
        m = re.match(r'(#E\d+)\s*=\s*(\w+)\((.*)\)', line.strip())
        if not m:
            continue
        ref, tool, args = m.group(1), m.group(2), m.group(3)
        deps = re.findall(r'#E\d+', args)
        nodes.append(PlanNode(ref=ref, tool=tool, args=args, deps=deps))
    return nodes
```

---

## Topological executor (resolves deps, supports parallel)

```python
import asyncio
from typing import Callable

async def execute_plan(
    nodes: list[PlanNode],
    tools: dict[str, Callable],
    evidence: dict[str, str] | None = None,
) -> dict[str, str]:
    if evidence is None:
        evidence = {}

    # Build dependency graph → topological levels
    remaining = list(nodes)
    while remaining:
        # Find nodes whose deps are all resolved
        ready = [n for n in remaining if all(d in evidence for d in n.deps)]
        if not ready:
            raise RuntimeError(f"Circular dependency or unresolvable: {[n.ref for n in remaining]}")

        # Resolve references in args, then execute in parallel
        async def run_node(node: PlanNode) -> tuple[str, str]:
            resolved_args = node.args
            for dep in node.deps:
                resolved_args = resolved_args.replace(dep, evidence[dep])
            try:
                result = tools[node.tool](resolved_args)
            except Exception as e:
                result = f"[error] {e}"
            return node.ref, str(result)

        results = await asyncio.gather(*[run_node(n) for n in ready])
        evidence.update(dict(results))
        remaining = [n for n in remaining if n.ref not in evidence]

    return evidence
```

---

## Solver prompt

```python
def build_solver_prompt(question: str, nodes: list[PlanNode], evidence: dict[str, str]) -> str:
    plan_lines = "\n".join(f"  {n.ref} = {n.tool}({n.args})" for n in nodes)
    evidence_lines = "\n".join(f"  {ref}: {val}" for ref, val in evidence.items())
    return f"""Answer the question using the plan and evidence below.

Question: {question}

Plan:
{plan_lines}

Evidence:
{evidence_lines}

Answer:"""
```

---

## When to pick ReWOO vs ReAct vs Plan-and-Execute

| Pattern | When |
|---------|------|
| **ReAct** | Dynamic, unknown number of steps; mid-plan discovery changes direction |
| **ReWOO** | Known structure; evidence can be fetched in parallel; token budget tight |
| **Plan-and-Execute** | Like ReWOO but add optional replanner after observing results |
| **Plan-and-Act** (ICML 2025) | Long-horizon web/mobile (30–50 steps); needs synthetic plan training data |

---

## Planner distillation

```
# ReWOO paper result: planner does not see observations →
# fine-tune a 7B model on planner outputs from a 175B teacher.
# Small model handles planning; big model not needed at inference.

# 2026 pattern: small planner (7B Mistral-class) + big executor (Claude/GPT-4-class)
# → plan quality stays high, execution cost stays low.
```

---

## Anti-Fake-Pass Checklist

```
❌ Static plan when task requires mid-plan adaptation → use replanner or fall back to ReAct
❌ Parallel execution ignoring dep order → #E3 runs before #E1/#E2 → wrong result
❌ Solver sees no evidence → planner produced refs not matching executor output keys
❌ No error handling in workers → one failed tool call silently poisons downstream nodes
❌ Re-using ReAct's full-context per step → kills the 5x token savings ReWOO promises
❌ Planning with big model + executing with big model → no cost savings; distill the planner
```

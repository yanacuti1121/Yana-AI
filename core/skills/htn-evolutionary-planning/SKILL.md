---
name: htn-evolutionary-planning
description: Hierarchical Task Network planning (provably correct plans via symbolic decomposition + LLM fallback) and AlphaEvolve evolutionary code search (fitness-gated genetic algorithm). ChatHTN 2025 hybrid, AlphaEvolve DeepMind 2025. Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yana-ai — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

# /htn-evolutionary-planning

## When to Use

- **HTN**: Plans must be provably correct by construction (compliance, scheduling, flight paths)
- **AlphaEvolve**: Optimization with machine-checkable fitness (matrix multiply, compiler passes, scheduling heuristics)
- When ReAct/ReWOO are insufficient: tasks with formal preconditions/effects or code-optimization goals
- ChatHTN hybrid: expanding an existing HTN domain with LLM-suggested decompositions

## Do NOT use for

- Open-ended creative tasks (no formal preconditions to validate against)
- Simple 1-3 step tasks where HTN overhead exceeds benefit
- Tasks without a machine-checkable evaluator (AlphaEvolve requires programmatic fitness)

---

## HTN concepts

```
Tasks       — compound (decomposed by methods) and primitive (directly executable)
Methods     — decompose a compound task into subtasks; have preconditions
Operators   — primitive actions with preconditions and effects
State       — set of facts (predicate → value map)
Planning    — find decomposition into primitives whose preconditions hold in sequence
```

---

## Minimal HTN planner

```python
from dataclasses import dataclass, field
from typing import Callable

@dataclass
class Operator:
    name: str
    preconditions: dict      # {predicate: value} that must hold
    effects: dict            # {predicate: value} applied after execution
    execute: Callable

@dataclass
class Method:
    name: str
    task: str                 # compound task this method decomposes
    preconditions: dict
    subtasks: list[str]       # ordered list of sub-task names

@dataclass
class HTNDomain:
    operators: dict[str, Operator] = field(default_factory=dict)
    methods:   dict[str, list[Method]] = field(default_factory=dict)

    def add_operator(self, op: Operator):
        self.operators[op.name] = op

    def add_method(self, method: Method):
        self.methods.setdefault(method.task, []).append(method)

def state_satisfies(state: dict, conditions: dict) -> bool:
    return all(state.get(k) == v for k, v in conditions.items())

def htn_plan(
    domain: HTNDomain,
    tasks: list[str],
    state: dict,
    llm_fallback: Callable[[str, dict], list[str]] | None = None,
) -> list[str]:
    """Returns ordered list of primitive operator names, or raises on failure."""
    plan: list[str] = []

    def decompose(task: str) -> bool:
        # Primitive operator
        if task in domain.operators:
            op = domain.operators[task]
            if not state_satisfies(state, op.preconditions):
                return False
            plan.append(task)
            state.update(op.effects)
            return True

        # Compound task — find applicable method
        for method in domain.methods.get(task, []):
            if state_satisfies(state, method.preconditions):
                saved_state = dict(state)
                saved_plan_len = len(plan)
                if all(decompose(sub) for sub in method.subtasks):
                    return True
                # Backtrack
                plan[saved_plan_len:] = []
                state.clear()
                state.update(saved_state)

        # ChatHTN fallback: ask LLM for decomposition
        if llm_fallback:
            subtasks = llm_fallback(task, state)
            saved_state = dict(state)
            saved_plan_len = len(plan)
            if all(decompose(sub) for sub in subtasks):
                # Learn: add as new method for future use
                domain.add_method(Method(task, task, {}, subtasks))
                return True
            plan[saved_plan_len:] = []
            state.clear()
            state.update(saved_state)

        return False

    for task in tasks:
        if not decompose(task):
            raise RuntimeError(f"HTN planning failed: cannot decompose '{task}' in state {state}")

    return plan
```

---

## ChatHTN: LLM fallback decomposition (Gopalakrishnan et al. 2025)

```python
def chatHTN_llm_fallback(domain: HTNDomain, llm) -> Callable[[str, dict], list[str]]:
    """
    ChatHTN claim: every plan is provably sound because LLM suggestions
    only enter as candidate decompositions — symbolic layer validates them.
    """
    def fallback(task: str, state: dict) -> list[str]:
        known_primitives = list(domain.operators.keys())
        known_compounds = list(domain.methods.keys())
        prompt = f"""Decompose the compound task '{task}' into subtasks.

Available operators (primitives): {known_primitives}
Available compound tasks:         {known_compounds}
Current state: {state}

Return a JSON list of subtask names. Use only known operators and compound tasks.
Example: ["pick_up_item", "move_to_location", "place_item"]"""

        import json, re
        response = llm(prompt)
        m = re.search(r'\[.*\]', response, re.DOTALL)
        if not m:
            return []
        try:
            subtasks = json.loads(m.group(0))
            # Validate: only known tasks
            all_known = set(known_primitives) | set(known_compounds)
            return [t for t in subtasks if t in all_known]
        except json.JSONDecodeError:
            return []

    return fallback
```

---

## AlphaEvolve: evolutionary code search (DeepMind, arXiv:2506.13131)

```python
import random, copy

@dataclass
class Individual:
    code: str
    fitness: float | None = None

def alpha_evolve(
    initial_code: str,
    fitness_fn: Callable[[str], float],   # MUST be machine-checkable
    llm_mutate: Callable[[str, float], str],
    population_size: int = 10,
    generations: int = 20,
    elite_frac: float = 0.2,
) -> Individual:
    """
    AlphaEvolve loop:
    1. Initialize population from initial code
    2. Evaluate fitness (machine-checkable: test suite, benchmark, perf metric)
    3. Elites survive; LLM mutates survivors
    4. Repeat until budget exhausted
    """
    population = [Individual(code=initial_code) for _ in range(population_size)]

    for gen in range(generations):
        # Evaluate
        for ind in population:
            if ind.fitness is None:
                try:
                    ind.fitness = fitness_fn(ind.code)
                except Exception:
                    ind.fitness = 0.0

        # Sort by fitness
        population.sort(key=lambda x: x.fitness, reverse=True)
        best = population[0]
        print(f"Gen {gen}: best fitness = {best.fitness:.4f}")

        # Elitism: keep top fraction
        n_elites = max(1, int(population_size * elite_frac))
        elites = population[:n_elites]

        # Mutate: LLM generates variations of the elite programs
        new_population = list(elites)
        while len(new_population) < population_size:
            parent = random.choice(elites)
            mutant_code = llm_mutate(parent.code, parent.fitness)
            new_population.append(Individual(code=mutant_code))

        population = new_population

    return max(population, key=lambda x: x.fitness or 0.0)
```

---

## When each approach applies

```
Problem type                                    Approach
───────────────────────────────────────────────  ────────────────────
Compliance workflow (provably correct required)  HTN
Scheduling with formal preconditions             HTN
Matrix multiply / compiler pass optimization     AlphaEvolve
Unknown structure, dynamic discovery             ReAct ([[react-agent-loop]])
Token-efficient multi-step evidence gathering    ReWOO ([[rewoo-plan-execute]])
```

---

## Anti-Fake-Pass Checklist

```
❌ LLM decompositions not validated against operator schema → unsound plan (defeats HTN's purpose)
❌ AlphaEvolve with LLM-only fitness judge → not machine-checkable; evolution converges on gaming the judge
❌ HTN backtracking without state rollback → corrupted state after failed method
❌ AlphaEvolve population starts homogeneous → no diversity → premature convergence
❌ ChatHTN learns bad decompositions from LLM → online method learning must filter invalid decompositions
❌ Using HTN for open-ended tasks with no formal domain → cannot define preconditions/effects
```

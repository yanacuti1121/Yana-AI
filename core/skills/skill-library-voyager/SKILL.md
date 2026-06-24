---
name: skill-library-voyager
description: Skill library patterns from Voyager — executable code as skills, semantic retrieval, composition, failure-driven refinement. Maps to Claude Agent SDK skills, skillkit, lifelong learning agents. Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yana-ai — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

# /skill-library-voyager

## When to Use

- Agent keeps re-deriving the same capability on every session (token waste)
- Building a lifelong-learning agent that accrues capability over time
- Implementing Claude Agent SDK skill files backed by a retrieval store
- Creating a composable capability library for a multi-agent system

## Do NOT use for

- One-shot tasks where skill reuse has no value
- Tasks with highly unique, non-repeatable capabilities
- Simple tool-use patterns where a tool registry ([[react-agent-loop]]) suffices

---

## Voyager: three components

```
1. Automatic curriculum   — curiosity-driven task proposer (bottom-up exploration)
2. Skill library          — executable code keyed on description + embedding
3. Iterative prompting    — on failure: errors + environment feedback → refine skill
```

**Why action space = code:**
Voyager emits function bodies, not primitive commands. A skill is composable:
`craftIronPickaxe()` calls `mineIron()`, `mineStick()`, `placeCraftingTable()`, `craft()`.
Stored keyed on description + embedding. Loaded as program, not prompt.

---

## Skill store

```python
from dataclasses import dataclass, field
import hashlib, json, re

@dataclass
class Skill:
    name: str
    description: str
    code: str
    version: int = 1
    success_count: int = 0
    failure_count: int = 0

    @property
    def id(self) -> str:
        return hashlib.sha256(self.name.encode()).hexdigest()[:8]

    def reliability(self) -> float:
        total = self.success_count + self.failure_count
        return self.success_count / total if total else 0.0

@dataclass
class SkillLibrary:
    skills: dict[str, Skill] = field(default_factory=dict)

    def register(self, name: str, description: str, code: str) -> Skill:
        skill = Skill(name=name, description=description, code=code)
        self.skills[name] = skill
        return skill

    def retrieve(self, query: str, top_k: int = 3) -> list[Skill]:
        """Toy keyword retrieval — replace with embedding cosine similarity."""
        q_words = set(query.lower().split())
        scored = []
        for skill in self.skills.values():
            desc_words = set(skill.description.lower().split())
            overlap = len(q_words & desc_words)
            scored.append((overlap, skill))
        scored.sort(key=lambda x: (-x[0], -x[1].reliability()))
        return [s for _, s in scored[:top_k]]

    def update(self, name: str, new_code: str) -> str:
        if name not in self.skills:
            return f"[error] skill '{name}' not found"
        self.skills[name].code = new_code
        self.skills[name].version += 1
        return f"skill '{name}' updated to v{self.skills[name].version}"

    def record_outcome(self, name: str, success: bool) -> None:
        if name in self.skills:
            if success:
                self.skills[name].success_count += 1
            else:
                self.skills[name].failure_count += 1
```

---

## Iterative prompting — skill refinement on failure

```python
def build_skill_refinement_prompt(
    task: str,
    current_code: str,
    error_output: str,
    env_feedback: str,
) -> str:
    return f"""The following skill failed. Rewrite it to fix the errors.

Task: {task}

Current code:
```python
{current_code}
```

Execution errors:
{error_output}

Environment feedback:
{env_feedback}

Write an improved version that handles the failure. Return only the code block."""
```

---

## Agent using skill library

```python
def agent_with_skills(task: str, library: SkillLibrary, llm, executor) -> str:
    # 1. Retrieve relevant skills
    candidates = library.retrieve(task, top_k=3)
    skill_context = "\n\n".join(
        f"# {s.name} (reliability={s.reliability():.0%})\n{s.description}\n```python\n{s.code}\n```"
        for s in candidates
    )

    # 2. Ask LLM to compose or extend
    prompt = f"""Task: {task}

Available skills:
{skill_context}

Write a solution that composes these skills (or a new skill if none apply).
Return Python code."""
    code = llm(prompt)

    # 3. Execute with iterative refinement (max 3 attempts)
    for attempt in range(3):
        result, error = executor(code)
        if not error:
            # Register as new skill if solution is novel
            skill_name = extract_function_name(code)
            if skill_name and skill_name not in library.skills:
                library.register(skill_name, task, code)
            return result

        # Refine on failure
        refinement_prompt = build_skill_refinement_prompt(task, code, error, result)
        code = llm(refinement_prompt)

    return f"[failed after 3 attempts] last error: {error}"

def extract_function_name(code: str) -> str | None:
    import re
    m = re.search(r'def (\w+)\s*\(', code)
    return m.group(1) if m else None
```

---

## Claude Agent SDK mapping

```
Voyager skill        → Claude Agent SDK skill file (SKILL.md)
Library registration → /plugin install or skills/ directory scan
Retrieval            → agent reads SKILL.md trigger patterns → loads matching skill
Refinement           → /improve-skill command (human-gated in YAMTAM)
Reliability score    → YAMTAM skill confidence / review_status field
```

---

## Anti-Fake-Pass Checklist

```
❌ Code skills with side effects stored without sandboxing → a bad skill deletes files
❌ No reliability score → agent uses a skill with 20% success rate as confidently as one with 95%
❌ Unbounded library growth → retrieval quality degrades; add a consolidation / GC pass
❌ Skill registered before testing → new skills must pass at least one successful execution first
❌ Single embedding for description → add code body embedding for retrieval by implementation pattern
❌ No version tracking → bug-fixed skill replaces original silently; can't audit regressions
```

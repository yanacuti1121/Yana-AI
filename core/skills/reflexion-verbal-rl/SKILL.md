---
name: reflexion-verbal-rl
description: Reflexion verbal reinforcement learning — Actor/Evaluator/Self-Reflector loop with episodic memory. No gradient updates. ALFWorld +X% over ReAct, HumanEval SOTA at publish time. Foundation for CLAUDE.md learnings, Letta sleep-time compute, learn-rule. Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yamtam-engine — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.54
---

# /reflexion-verbal-rl

## When to Use

- Agent failed a task and you want self-improvement without retraining
- Cross-session learning: storing failure reflections so next session avoids the same mistake
- Automated quality improvement over N trials (code gen, planning, reasoning tasks)
- Implementing CLAUDE.md-style "save memory" patterns with automatic failure analysis

## Do NOT use for

- Tasks with no external evaluator and no ground truth (pure creative writing)
- Single-shot tasks where a second trial isn't possible
- Gradient-based fine-tuning workflows (Reflexion is prompt-only, no weight updates)

---

## The three components + episodic memory

```
Actor          : generates a trajectory (any agent loop — ReAct, ReWOO, etc.)
Evaluator      : scores the trajectory → binary / heuristic / self-eval
Self-Reflector : writes natural-language reflection on the failure
Episodic memory: list of prior reflections, prepended to next trial's prompt
```

---

## Reflexion loop (stdlib)

```python
from dataclasses import dataclass, field
from typing import Callable

@dataclass
class ReflexionAgent:
    actor:      Callable[[str, list[str]], str]   # (task, reflections) -> trajectory
    evaluator:  Callable[[str, str], bool]         # (task, trajectory) -> success
    reflector:  Callable[[str, str], str]          # (task, trajectory) -> reflection
    max_trials: int = 5

    def run(self, task: str) -> tuple[str, list[str]]:
        reflections: list[str] = []

        for trial in range(self.max_trials):
            # Actor gets task + all prior reflections
            trajectory = self.actor(task, reflections)

            # Evaluator checks success
            if self.evaluator(task, trajectory):
                return trajectory, reflections

            # Self-Reflector diagnoses failure
            reflection = self.reflector(task, trajectory)
            reflections.append(f"[Trial {trial + 1}] {reflection}")
            print(f"Trial {trial + 1} failed. Reflection: {reflection}")

        return trajectory, reflections  # best effort after max_trials
```

---

## Actor prompt (task + reflections)

```python
def build_actor_prompt(task: str, reflections: list[str]) -> str:
    memory_block = ""
    if reflections:
        memory_block = "\n\nPast failure reflections (do NOT repeat these mistakes):\n"
        memory_block += "\n".join(f"- {r}" for r in reflections)

    return f"""Complete the following task.{memory_block}

Task: {task}

Respond with your reasoning and final answer."""
```

---

## Three evaluator types

```python
# 1. SCALAR — external binary (best signal)
def unit_test_evaluator(task: str, code: str) -> bool:
    import subprocess, tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".py", delete=False, mode="w") as f:
        f.write(code)
        f.write("\n# Auto-test\nassert solution() is not None\n")
        fname = f.name
    result = subprocess.run(["python", fname], capture_output=True, timeout=10)
    os.unlink(fname)
    return result.returncode == 0

# 2. HEURISTIC — failure signature detection
def heuristic_evaluator(task: str, trajectory: str) -> bool:
    lines = trajectory.strip().split("\n")
    # Detect stuck loop: same action twice in a row
    actions = [l for l in lines if l.startswith("Action:")]
    if len(actions) >= 2 and actions[-1] == actions[-2]:
        return False
    # Detect trajectory too long
    if len(lines) > 50:
        return False
    return "ANSWER:" in trajectory

# 3. SELF-EVAL — LLM judges its own output (weakest; combine with heuristics)
def self_eval_prompt(task: str, trajectory: str) -> str:
    return f"""Did the agent successfully complete the task?

Task: {task}

Agent trajectory:
{trajectory}

Reply YES if complete and correct, NO if not. Start your reply with YES or NO."""
```

---

## Self-Reflector prompt

```python
def build_reflector_prompt(task: str, trajectory: str) -> str:
    return f"""You are analyzing a FAILED agent attempt.

Task: {task}

Failed trajectory:
{trajectory}

Write a concise reflection (2-3 sentences) identifying:
1. What went wrong
2. What the agent should do differently next time

Start with "I failed because..."."""
```

---

## Where this pattern appears in 2026 production

```
CLAUDE.md / "save memory"   → failure captured as rule, prepended to next session
Letta sleep-time compute    → async agent reflects on past conversations → writes to memory blocks
YAMTAM /learn-rule          → corrections captured as explicit rules
LangGraph reflection node   → routes to refine sub-graph when evaluator fails
pro-workflow                → per-task reflections accumulate into agent CLAUDE.md
```

---

## Anti-Fake-Pass Checklist

```
❌ History not passed to refiner → model repeats the same mistake on every trial
❌ Self-eval only (no external verifier) → LLM scores its own hallucination as correct
❌ No max_trials cap → infinite loop on tasks the model can never solve
❌ Reflection too vague ("try harder") → must name the specific mistake + specific fix
❌ Episodic memory grows unbounded → after 10+ trials, memory dominates context; add a trim
❌ Conflating Reflexion (verbal RL) with RLHF (gradient RL) → no weight updates here
```

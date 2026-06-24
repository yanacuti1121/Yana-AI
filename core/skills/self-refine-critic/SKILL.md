---
name: self-refine-critic
description: Self-Refine iterative improvement (generate/feedback/refine loop, +20 avg across 7 tasks) and CRITIC external verification (tool-grounded critique for factual tasks). Anthropic evaluator-optimizer pattern. Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yana-ai — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

# /self-refine-critic

## When to Use

- Output is close but wrong (syntax error, formatting violation, missing edge case)
- Code needs iterative improvement with test runner as verifier (CRITIC mode)
- Factual claim verification against search/calculator before accepting output
- Implementing Anthropic's evaluator-optimizer workflow pattern

## Do NOT use for

- Tasks with no external verifier AND creative quality goals (Self-Refine alone; accept weak feedback)
- Tasks requiring episodic memory across sessions (use [[reflexion-verbal-rl]])
- One-shot tasks where a second attempt is not cost-effective

---

## Self-Refine: three prompts in a loop

```
generate(task)                          → output_0
feedback(task, output_0)                → critique_0
refine(task, output_0, critique_0, history) → output_1
feedback(task, output_1)                → critique_1
refine(…history)                        → output_2
stop: feedback says "no issues" | verifier passes | max_iterations
```

**Key:** `refine` sees the **full history** (all prior outputs + critiques). Drop history → quality drops sharply (per paper ablation).

---

## Minimal Self-Refine loop

```python
from typing import Callable

def self_refine(
    task: str,
    generate: Callable[[str], str],
    feedback: Callable[[str, str], str],
    refine: Callable[[str, list[tuple[str, str]]], str],
    is_done: Callable[[str], bool],
    max_iter: int = 4,
) -> str:
    output = generate(task)
    history: list[tuple[str, str]] = []  # (output, critique)

    for _ in range(max_iter):
        critique = feedback(task, output)
        if is_done(critique):
            break
        history.append((output, critique))
        output = refine(task, history)

    return output
```

---

## CRITIC: tool-grounded feedback

```python
def critic_feedback(task: str, output: str, tools: dict) -> str:
    """
    CRITIC replaces the LLM-only feedback step with tool-verified critique.
    Routes each claim type to the appropriate external verifier.
    """
    issues = []

    # Code → run it
    if "```python" in output or "def " in output:
        import subprocess, textwrap, re
        code_match = re.search(r'```python\n(.*?)```', output, re.DOTALL)
        if code_match:
            code = code_match.group(1)
            result = subprocess.run(
                ["python", "-c", code], capture_output=True, text=True, timeout=10
            )
            if result.returncode != 0:
                issues.append(f"Code error: {result.stderr[:300]}")

    # Math → evaluate
    import re
    for expr in re.findall(r'\b(\d[\d\s\+\-\*\/\^\(\)\.]+\=\s*[\d\.]+)\b', output):
        lhs, rhs = expr.split("=")
        try:
            expected = eval(lhs.strip(), {"__builtins__": {}})
            claimed = float(rhs.strip())
            if abs(expected - claimed) > 0.01:
                issues.append(f"Math error: {lhs.strip()} = {expected}, not {claimed}")
        except Exception:
            pass

    if not issues:
        return "LGTM — no issues found."
    return "Issues found:\n" + "\n".join(f"- {i}" for i in issues)
```

---

## Refine prompt with history

```python
def build_refine_prompt(task: str, history: list[tuple[str, str]]) -> str:
    history_block = "\n\n".join(
        f"Attempt {i+1}:\n{out}\n\nCritique:\n{crit}"
        for i, (out, crit) in enumerate(history)
    )
    last_output = history[-1][0]
    last_critique = history[-1][1]
    return f"""Task: {task}

Prior attempts and critiques:
{history_block}

Fix all issues raised in the critiques. Do not repeat previous mistakes.
Produce an improved version:"""
```

---

## Stop condition (combine both signals)

```python
def is_done(critique: str, iteration: int, max_iter: int) -> bool:
    no_issues = "lgtm" in critique.lower() or "no issues" in critique.lower()
    if no_issues and iteration >= 2:   # require at least 2 iters before accepting
        return True
    if iteration >= max_iter:
        return True
    return False
```

---

## Anthropic evaluator-optimizer wiring

```python
# Pattern from Anthropic Dec 2024 workflow guide
# Proposer generates, Evaluator judges, loop until pass

def evaluator_optimizer(
    task: str,
    proposer,       # LLM call → output
    evaluator,      # LLM or tool call → (passed: bool, feedback: str)
    max_loops: int = 3,
) -> str:
    output = proposer(task)
    for _ in range(max_loops):
        passed, feedback = evaluator(task, output)
        if passed:
            return output
        output = proposer(f"{task}\n\nPrevious attempt failed:\n{feedback}\n\nTry again:")
    return output
```

---

## Anti-Fake-Pass Checklist

```
❌ History dropped from refine prompt → model repeats identical mistake
❌ LLM-only feedback for factual claims → hallucination scores itself as correct
❌ No iteration floor (accept on first "LGTM") → model lazily validates itself after one pass
❌ max_iter not set → infinite refinement loop on unsolvable tasks
❌ CRITIC applied without available external tool → falls back to LLM self-eval silently
❌ Confusing Self-Refine (same-session loop) with Reflexion (cross-trial episodic memory)
```

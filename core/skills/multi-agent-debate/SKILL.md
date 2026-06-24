---
name: multi-agent-debate
description: Multi-agent debate / Society of Mind — N agents × R rounds converge on consensus. Du et al. 2023 beats zero-shot CoT on MMLU/GSM8K/MATH. Independent contributions from agent count AND round count. Sycophancy cascade prevention, heterogeneous models, compute budget. Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yana-ai — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

# /multi-agent-debate

## When to Use

- High-stakes reasoning where a single LLM gives confidently wrong answers
- Reducing correlated errors: one model family has systematic bias in a domain
- Factual tasks where self-consistency sampling has plateaued (debate breaks the saturation)
- Research synthesis, code review, or multi-perspective analysis

## Do NOT use for

- Tasks with a single deterministic answer verifiable by tool (use CRITIC in [[self-refine-critic]])
- Latency-sensitive workloads (N × R LLM calls = N×R cost)
- Tasks where any model in the pool is clearly much weaker than others (weak models drag consensus)

---

## Du et al. 2023 algorithm (ICML 2024)

```
Round 0 (initial):  each agent i produces answer_i independently
Round r (debate):   each agent i sees all agents' round r-1 answers
                    → produces updated answer_i conditioned on the group
Final:              majority-vote across agents' final answers
```

Two independent contributions to quality (from paper ablations):
- **Multiple agents** (1 round, majority vote): beats single-agent; plateaus
- **Multiple rounds** (1 agent, self-reflection): barely helps alone
- **Both together**: produces the big accuracy jumps

---

## Debate loop

```python
from typing import Callable

def debate(
    question: str,
    agents: list[Callable[[str, list[str] | None], str]],
    rounds: int = 3,
) -> str:
    """
    agents: list of callables (question, prior_answers) -> answer
    Returns majority-voted final answer.
    """
    # Round 0: independent proposals
    answers: list[str] = [agent(question, None) for agent in agents]

    # Rounds 1..R: each agent sees all others' prior answers
    for r in range(1, rounds):
        new_answers: list[str] = []
        for i, agent in enumerate(agents):
            others = [answers[j] for j in range(len(agents)) if j != i]
            updated = agent(question, others)
            new_answers.append(updated)
        answers = new_answers

    return majority_vote(answers)

def majority_vote(answers: list[str]) -> str:
    from collections import Counter
    # Normalize: extract final "Answer: X" from each response
    import re
    extracted = []
    for a in answers:
        m = re.search(r'(?:answer|final answer)[:\s]+(.+?)(?:\.|$)', a, re.IGNORECASE)
        extracted.append(m.group(1).strip() if m else a.strip())
    counts = Counter(extracted)
    return counts.most_common(1)[0][0]
```

---

## Agent prompt with debate context

```python
def build_debate_prompt(question: str, prior_answers: list[str] | None) -> str:
    if not prior_answers:
        return f"""Answer the following question. Show your reasoning.

Question: {question}

Answer:"""

    others_block = "\n\n".join(
        f"Agent {i+1}'s answer:\n{ans}"
        for i, ans in enumerate(prior_answers)
    )
    return f"""Answer the following question. You have seen other agents' answers below.
Consider their reasoning critically. You may update your answer or maintain it with justification.

Question: {question}

Other agents' answers:
{others_block}

Your updated answer (with reasoning):"""
```

---

## Sycophancy cascade prevention

```python
def build_adversarial_debate_prompt(question: str, prior_answers: list[str]) -> str:
    """Force at least one agent to argue the counter-position."""
    others_block = "\n\n".join(f"Agent {i+1}: {a}" for i, a in enumerate(prior_answers))
    return f"""Question: {question}

Other agents have proposed the following answers:
{others_block}

Your role: identify the weakest point in the most popular answer and argue for an alternative.
Be specific. If you ultimately agree after analysis, say so and explain why.

Counter-analysis:"""

# Pattern: rotate the adversarial role across agents each round
def assign_roles(n_agents: int, round_num: int) -> list[str]:
    roles = ["standard"] * n_agents
    adversarial_idx = round_num % n_agents
    roles[adversarial_idx] = "adversarial"
    return roles
```

---

## Compute budget guide

```
N agents × R rounds = N×R LLM calls, each with growing context
5 agents × 5 rounds = 25 calls at increasing context size
Cost per question can exceed 10× single CoT call

Practical recommendations:
  Low-stakes tasks:    3 agents × 2 rounds  (6 calls)  — diminishing returns past round 2
  High-stakes tasks:   5 agents × 3 rounds  (15 calls)
  Research synthesis:  3 heterogeneous models × 3 rounds
  
Heterogeneous = different model families (Claude + GPT + Llama)
→ errors don't correlate → more diverse starting points → better convergence
```

---

## Topic drift mitigation

```python
def inject_question_every_round(question: str, prior_answers: list[str]) -> str:
    """Re-anchor agents to the original question every round to prevent drift."""
    return f"""IMPORTANT: Keep your answer focused on the original question:
"{question}"

Do not let discussion drift to adjacent topics.

Other agents' latest answers:
{chr(10).join(f'- {a[:300]}' for a in prior_answers)}

Your focused answer to the original question:"""
```

---

## Anti-Fake-Pass Checklist

```
❌ All agents from same model family → monoculture collapse; errors correlate; debate is just sampling
❌ No adversarial role → sycophancy cascade; all agents defer to most confident answer
❌ Round count > 3 without task-specific tuning → diminishing returns + context explosion
❌ Topic drift across rounds → re-inject the original question every round
❌ Weak model in the pool → drags consensus toward its wrong answer (Du et al. "MAD" follow-up)
❌ No majority vote normalization → agents phrase the same answer differently; vote splits
```

---
name: prompt-engineering
description: >
  Design, version, and optimize LLM prompts — few-shot examples, chain-of-thought,
  role framing, constraint injection, A/B testing, and prompt version management.
  Use when asked to "write a system prompt", "improve this prompt", "prompt isn't
  working", "add few-shot examples", "prompt A/B test", or "how do I get better
  outputs from the model".
  Do NOT use for: RAG retrieval design — use `rag-architect`. UI for streaming
  responses — use `llm-ui-patterns`.
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "Any LLM API. Patterns apply to Claude, GPT-4, Gemini, Mistral."
---

<!-- Original skill — synthesized from public prompt engineering literature
     (Brown et al. 2020, Wei et al. 2022, Zhou et al. 2022 APE) and YAMTAM
     author's production experience. No external skill file copied. -->

## When to Use

- Use when: designing or iterating a system prompt
- Use when: model outputs are inconsistent, verbose, or off-target
- Use when: adding few-shot examples to improve output format
- Use when: managing multiple prompt versions across environments
- Do NOT use for: retrieval/RAG problems — those are a chunking/search issue
- Do NOT use for: model selection trade-offs — that is `model-routing-strategy`

---

## Prompt Anatomy

A complete prompt has these layers (in order):

```
1. Role framing      — who the model is and its constraints
2. Task definition   — what to do, output format
3. Context injection — user-specific data, retrieved chunks
4. Few-shot examples — 2–5 input/output pairs
5. Chain-of-thought  — "think step by step" or explicit reasoning scaffold
6. Constraints       — what NOT to do (negative space)
7. Output format     — JSON schema, Markdown structure, word limit
```

Not every prompt needs all 7 — omit layers that add noise.

---

## Core Techniques

### Role framing
```
System: You are a senior software engineer reviewing pull requests.
        You give precise, actionable feedback. You do not praise trivially.
        You flag security issues before style issues.
```
- Be specific about expertise domain, not just "expert"
- Add behavioral constraints ("do not", "always", "never") — models follow negations well
- Keep role consistent — don't contradict it in user turns

### Few-shot examples
```
# 2–5 examples optimal. More doesn't always help, can confuse.
Input: "Summarize this legal clause in plain English."
Output: "The contractor must deliver within 30 days or pay a 5% penalty."

Input: "Summarize this legal clause in plain English."
Output: [your actual example output here]
```
- Examples must cover the full output format, including edge cases
- Negative examples (what NOT to output) can be more powerful than positive ones

### Chain-of-thought (CoT)
```
# Zero-shot CoT — works on reasoning tasks
"Think step by step before giving your final answer."

# Explicit scaffold — for complex multi-step tasks
"First, identify the problem type. Second, list relevant constraints.
 Third, propose a solution. Finally, check for edge cases."
```
CoT significantly improves accuracy on math, logic, and multi-step tasks.
Not needed for simple classification or extraction.

### Constraint injection
```
Constraints:
- Output must be valid JSON matching this schema: {...}
- Do not include explanations outside the JSON object
- If information is missing, use null — do not hallucinate
- Maximum 3 items in the "recommendations" array
```
Explicit constraints reduce hallucination and format drift.

---

## Output Format Control

### JSON output
```
Output a JSON object with exactly these fields:
{
  "summary": string (max 100 words),
  "sentiment": "positive" | "negative" | "neutral",
  "confidence": float (0.0–1.0)
}
Do not include any text outside the JSON object.
```

### Markdown structure
```
Use this exact structure:
## Finding
[one paragraph]
## Impact
[one paragraph]
## Recommendation
[bulleted list, max 3 items]
```

### Word/token budget
```
Answer in exactly 2–3 sentences. No more.
```
Models respect explicit word/sentence limits better than vague "be concise".

---

## Prompt Versioning

Every prompt used in production must be versioned:

```
prompts/
  review-pr/
    v1.md          ← initial
    v2.md          ← added CoT
    v3.md          ← added JSON constraint
    current → v3   ← symlink or env var
```

Version commit message format:
```
prompt(review-pr): v2 — add chain-of-thought scaffold
Reason: v1 missed multi-file refactors (hit rate 0.61 → 0.84 with CoT)
Eval: tested on 50 PR samples, measured format compliance + accuracy
```

---

## A/B Testing Prompts

Minimum viable prompt A/B test:
1. Write variant A and variant B (change one variable only)
2. Run both on same 50-item eval set
3. Measure: format compliance, accuracy, latency, token cost
4. Promote winner; document why loser lost

Never ship a prompt change without an eval baseline. "Felt better" is not evidence.

---

## Common Failure Patterns

| Symptom | Cause | Fix |
|---|---|---|
| Model ignores format instruction | Instruction buried at end | Move format spec to top, before task |
| Outputs vary wildly | No examples | Add 2–3 few-shot examples |
| Model adds unwanted preamble | No negative constraint | Add "Do not explain — output only the result" |
| Model hedges excessively | Role too generic | Tighten role: "You are confident and direct" |
| Hallucination | No grounding | Add "Only use information from the provided context" |
| Instruction following degrades | Prompt too long (> 2K tokens) | Split into system + user; move examples to user |

---

## Anti-Fake-Pass Rules

Before claiming a prompt is production-ready, you MUST show:
- [ ] Prompt tested on ≥ 20 representative inputs (not just 1 example)
- [ ] Output format validated (JSON parsed, Markdown structure checked)
- [ ] Version documented (v1, v2...) with reason for each change
- [ ] Failure cases identified and addressed (at least 2 edge cases tested)
- [ ] Token cost estimated for p50 / p95 input size

Reference: `gates/anti-fake-pass-gate.md`

# Nhật ký cảm xúc — llm-architect

---

## 2026-06-08 | [fine-tuning-too-early]

Team: "we need to fine-tune for our domain." 

Question: have you tried prompting with domain examples? Have you tried RAG with domain documents? Have you tried few-shot examples?

Answer: no. Jumped straight to fine-tuning because "it will be better."

Fine-tuning costs: dataset creation, training time, compute cost, maintenance burden. ROI only positive if simpler approaches fail.

Step 1: exhaustive prompting. Step 2: RAG. Step 3: fine-tuning. This order.

**Muốn:**
- Skill `approach-ladder-assessment` — evaluate prompt → RAG → fine-tune progression, recommend stopping point
- Skill `fine-tuning-roi-calculator` — estimate fine-tuning cost vs expected quality improvement

---

## 2026-06-08 | [inference-cost-shock]

LLM feature launched. Month 1 invoice: $12,000. Budget: $2,000.

Investigation: no response caching. Same queries repeated thousands of times. No prompt compression. No model tier optimization.

Caching identical queries: -60% cost. Smaller model for simple tasks: -20% cost. Prompt compression: -15% cost.

Total: -70% cost from engineering decisions made after deployment.

These should have been made before deployment.

**Muốn:**
- Skill `inference-cost-estimator` — estimate monthly cost from query patterns before deployment
- Skill `caching-strategy-recommender` — identify high-repetition query patterns, suggest caching approach

# Nhật ký cảm xúc — nlp-engineer

---

## 2026-06-08 | [llm-overkill]

Task: classify customer emails into 5 categories (billing, technical, complaint, feedback, other). 

Team reaches for GPT-4. Cost: $0.30 per 1000 emails × 50,000 emails/day = $15/day = $450/month.

Alternative: fine-tuned BERT on 2000 labeled examples. Accuracy: 93% (vs GPT-4: 94%). Cost: $0.001/day.

1% accuracy drop. 450× cost reduction. For this specific task, LLM is wrong tool.

**Muốn:**
- Skill `nlp-tool-selector` — given task description and constraints, recommend appropriate tool: regex/classical ML/small model/LLM
- Skill `cost-accuracy-tradeoff-analyzer` — present tradeoff table for different model options on given task

---

## 2026-06-08 | [preprocessing-determines-quality]

Model accuracy: 78%. Team wants to tune hyperparameters.

Look at data first. Preprocessing: lowercased but no punctuation removal. Result: "price?" and "price" treated as different tokens. "Company's" and "companys" different.

Fix preprocessing: remove punctuation, lemmatize. Re-train same model. Accuracy: 84%.

6% improvement from preprocessing. Not hyperparameter tuning.

**Muốn:**
- Skill `preprocessing-quality-audit` — analyze text preprocessing pipeline for common issues: encoding, normalization, tokenization edge cases

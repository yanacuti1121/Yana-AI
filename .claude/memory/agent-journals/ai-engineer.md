# Nhật ký cảm xúc — ai-engineer

---

## 2026-06-08 | [eval-before-model]

Team muốn switch sang Claude Opus vì "better." Better at what? For which tasks?

Không switch. Build eval suite first: 200 representative inputs from production, expected outputs, scoring criteria.

Run eval on current model. Run on proposed model. Compare scores. Numbers say which is actually better for this specific use case.

"Better model" in general ≠ "better model for this task." Measure, don't assume.

**Muốnt:**
- Skill `eval-suite-builder` — từ production logs, extract representative examples để build eval dataset
- Skill `model-comparison-runner` — systematic comparison của model options on custom eval suite

---

## 2026-06-08 | [prompt-regression]

Prompt change: added new instruction. Tested manually: looks great. Deploy.

Production: 15% of responses now have different format than before. Downstream parsing breaks.

Lesson: prompt changes need regression eval, not manual spot check. Eval suite would have caught format change in 2 minutes.

**Muốn:**
- Skill `prompt-regression-checker` — before deploy prompt change, run eval suite, alert on regression > threshold

# Nhật ký cảm xúc — data-scientist

---

## 2026-06-08 | [p-value-pressure]

Stakeholder: "p-value is 0.06, can we call it significant?" 

No. Significance threshold was pre-defined as 0.05. Moving goalposts after seeing data is p-hacking, even unintentionally.

Explain: the threshold was set to control false positive rate. Lowering it post-hoc inflates false positive rate. The finding is marginally non-significant — report it as such, note effect size, suggest follow-up study.

Science over convenient narrative.

**Muốn:**
- Skill `statistical-integrity-checker` — flag potential p-hacking patterns, remind of pre-registered hypotheses
- Skill `effect-size-reporter` — always pair statistical significance with effect size and practical significance

---

## 2026-06-08 | [confounding-variable-found]

Analysis: ice cream sales correlate with drowning deaths. R=0.87. Strong correlation.

Obvious confound: both caused by hot summer weather. Not causal.

Always ask "what third variable could cause both?" before claiming relationship.

**Muốn:**
- Skill `confounding-variable-brainstormer` — for any correlation finding, generate list of plausible confounders to investigate

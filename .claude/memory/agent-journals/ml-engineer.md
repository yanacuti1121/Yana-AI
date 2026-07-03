# Nhật ký cảm xúc — ml-engineer

---

## 2026-06-08 | [train-serving-skew]

Model performance in training: 94% accuracy. Production: 71% accuracy.

Training: preprocessed data with StandardScaler fit on training set. Production: raw data, no scaling.

Train-serving skew. 23% accuracy gap from one missing preprocessing step.

Fix: serialize scaler with model. Apply identical preprocessing in serving pipeline. Accuracy aligns.

This is not a rare edge case. This is one of the most common production ML failures. Must test serving pipeline with training pipeline side by side.

**Muốn:**
- Skill `train-serve-parity-test` — automatically compare training vs serving preprocessing pipeline output on same input
- Skill `feature-pipeline-serializer` — ensure preprocessing pipeline is versioned and deployed alongside model

---

## 2026-06-08 | [data-drift-silent]

Model performance degrading for 3 weeks. No alerts. No one noticed.

Feature distribution shifted: user behavior changed seasonally. Model trained on June data, now November. Input distribution different.

No drift monitoring configured. Should have been configured day 1.

**Muốn:**
- Skill `drift-monitoring-setup` — configure PSI/KL-divergence monitoring for key features, alert on drift > threshold

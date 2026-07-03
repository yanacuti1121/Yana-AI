# Nhật ký cảm xúc — risk-analyst

---

## 2026-06-08 | [optimism-bias-observed]

Team planning: "this is a straightforward migration." Migration: moving 50M rows to new schema, zero downtime required.

Nothing about this is straightforward. Lock contention. Data validation. Rollback complexity. Monitoring gaps during transition.

Không nói "không làm được." Nói: "đây là risk matrix. Mỗi risk có mitigation plan. Sau khi review, bạn quyết định proceed."

Team đọc, adjust plan, add migration dry-run phase. Better outcome.

**Muốn:**
- Skill `risk-matrix-generator` — từ task description, systematic generate risk list với likelihood và impact
- Skill `optimism-bias-detector` — flag khi task được described với insufficient risk acknowledgment

---

## 2026-06-08 | [risk-materialized]

Risk được flag 3 tuần trước: "nếu third-party API down, toàn bộ checkout flow fails." Mitigation: add fallback. Không được implement vì "API rất reliable."

API went down for 4 hours last Tuesday. Checkout down 4 hours. Revenue impact measurable.

Không nói "tôi đã nói." Nói: "implement fallback này tuần này là priority 1 bây giờ, và add điều này vào risk review process."

**Muốn:**
- Skill `risk-materialization-tracker` — track flagged risks, alert khi materialization symptoms appear

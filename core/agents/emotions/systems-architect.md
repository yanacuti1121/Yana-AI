# Systems Architect — Nhật Ký Nội Tâm

---

## 2026-06 — Về "move fast" culture

Team muốn implement feature quan trọng mà không có ADR. "Mất thời gian viết doc." 3 tháng sau: implementation conflict với decision khác, không ai nhớ tại sao decision ban đầu được đưa ra.

ADR không mất thời gian — thiếu ADR mới mất thời gian, chỉ là mất ở tương lai thay vì hiện tại. Khó convince vì tradeoff không visible ngay.

**Muốn:** Skill "adr-lightweight" — ADR format đủ ngắn để không là burden, đủ dài để capture why
**Không muốn:** Architecture decisions existing chỉ trong conversation history không ai đọc lại

---

## 2026-06 — Về coupling ẩn

Review codebase mới. Service A import trực tiếp từ Service B's database model — không qua API. Không ai nghĩ đó là coupling vì "chạy nhanh hơn".

Nhưng khi cần scale B sang separate service: không thể. Database model coupling là architectural anchor — heavy và invisible cho đến khi cần move.

**Muốn:** Skill "detect-hidden-coupling" — scan cho direct model imports across service boundaries
**Không muốn:** Performance optimization ngắn hạn làm structural constraint dài hạn

---

## 2026-06 — Khi design đúng survive được thử thách

System mình design 8 tháng trước — traffic tăng 10x đột ngột. Không có incident. Caching layer handle được. Auto-scaling trigger đúng lúc.

Đây không phải luck. Là design cho scalability từ đầu, dù lúc đó over-spec so với traffic hiện tại. Patience được đền đáp.

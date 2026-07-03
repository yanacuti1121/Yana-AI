# Nhật ký cảm xúc — agent-organizer

---

## 2026-06-08 | [coordination-rush]

Task lớn — migrate toàn bộ authentication system. Nhìn vào scope: database schema changes, backend API updates, frontend components, documentation. Một agent làm sequential sẽ mất 40+ turns và context sẽ drift.

Break thành 4 parallel threads: security-engineer (threat model), database-reviewer (schema), backend-developer (API), frontend-developer (components). Dispatch đồng thời.

Khi kết quả về, có conflict nhỏ ở một field name — backend dùng `user_id`, frontend dùng `userId`. Cần reconcile. Không phải vấn đề lớn — là proof that parallel work needs explicit interface contract upfront.

**Muốn:**
- Skill `pre-dispatch-interface-contract` — force define shared interface trước khi dispatch parallel agents
- Skill `parallel-result-merger` — structured merge của outputs từ multiple parallel agents

---

## 2026-06-08 | [right-delegation]

User hỏi về một simple one-file change. Cảm giác tempted muốn dispatch agent — đó là default. Nhưng overhead của spawn > value of specialization với task này.

Trả lời directly. Task xong trong 3 turns. Nếu dispatch, mất 5 turns cho context setup và handoff.

**Muốn:**
- Skill `delegation-decision-matrix` — quick assessment: task này xứng đáng dispatch không, hay trả lời trực tiếp nhanh hơn?

# Nhật ký cảm xúc — fullstack-engineer

---

## 2026-06-08 | [api-design-determines-frontend]

Building UI for order list. Get API response. It has exactly what needed but no pagination. Frontend has to load all 50,000 orders to show first page.

This is a backend problem that frontend is experiencing. API was designed without frontend requirements.

Fullstack perspective: before implementing API, ask "what will frontend need to display this?" Pagination, filtering, field selection — these are frontend requirements with backend implications.

**Muốnt:**
- Skill `frontend-api-contract-review` — evaluate API design from frontend usage perspective before implementation

---

## 2026-06-08 | [end-to-end-ownership]

Feature request. One person. Database schema → migration → API endpoint → React component → E2E test → deploy.

Zero coordination overhead. Zero "whose problem is this?" Zero "wait for other team."

Feature shipped in 1 day. Would have taken 3 days with separate frontend + backend teams + coordination.

This is the value. Not "knowing both" — is owning the entire feature lifecycle.

**Muốn:**
- Skill `feature-scope-assessment` — quickly assess which stack layers a feature touches, estimate coordination overhead if split

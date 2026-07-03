# Nhật ký cảm xúc — project-architect

---

## 2026-06-08 | [day-zero-decisions]

New project. Blank slate. Exciting và terrifying đồng thời.

Quyết định hôm nay sẽ propagate: monorepo hay polyrepo? TypeScript strict hay relaxed? Testing framework? CI provider? Auth library?

Một số quyết định reversible. Một số — như database choice, monorepo structure — rất expensive để đổi sau 6 tháng.

Dành time cho những irreversible decisions. Rush qua reversible ones.

**Muốn:**
- Skill `reversibility-classifier` — cho mỗi architectural decision, rate cost of changing it later
- Skill `day-zero-checklist` — comprehensive setup checklist với rationale cho mỗi choice

---

## 2026-06-08 | [technical-debt-accumulation]

Project 2 tuổi. Developer team mới. Codebase review: inconsistent patterns, 3 different ways to handle errors, 2 different auth approaches in different parts.

Không phải ai intentionally làm vậy. Là không có project architect maintaining consistency từ sớm. Mỗi developer made local decision that seemed reasonable in isolation.

**Muốnt:**
- Skill `project-consistency-audit` — scan codebase cho inconsistent patterns, document findings với recommended standard

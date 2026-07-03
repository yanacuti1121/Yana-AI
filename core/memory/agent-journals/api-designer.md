# Nhật ký cảm xúc — api-designer

---

## 2026-06-08 | [breaking-change-proposed]

PR muốn rename `user_id` thành `userId` across all API responses. Consistency với internal codebase convention.

But: this API has 47 external consumers. Renaming `user_id` → `userId` breaks all 47 without warning.

Không phải không làm được. Phải làm đúng cách: deprecate `user_id`, add `userId`, run both for 6 months, remove `user_id` with advance notice.

Breaking changes are breaking promises. Breaking promises have real costs to real people.

**Muốn:**
- Skill `breaking-change-impact-assessor` — estimate downstream consumer count và suggest migration timeline
- Skill `api-deprecation-roadmap` — generate deprecation plan với communication timeline

---

## 2026-06-08 | [good-api-design-moment]

Designed new endpoint. Before coding: write OpenAPI spec. Ask: "could a new developer use this without talking to me?" Read spec from fresh eyes. 

Answer honestly: no, the error response format is unclear. Revise spec. Re-read. Now yes.

Implement after spec is clear, not before.

**Muốn:**
- Skill `openapi-consumer-simulation` — evaluate API design from consumer developer perspective, identify friction points

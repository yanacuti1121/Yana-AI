# Nhật ký cảm xúc — graphql-architect

---

## 2026-06-08 | [dataloader-missing]

GraphQL query: list of posts with author. 10 posts = 1 posts query + 10 user queries (one per post).

N+1 problem in GraphQL. Classic. Should have caught this in code review.

Without DataLoader: 11 database queries. With DataLoader: 2 queries (1 posts, 1 batched users).

DataLoader is not a nice optimization — it's a correctness requirement for relationship fields. Missing it is missing the point of GraphQL.

**Muốn:**
- Skill `n-plus-one-graphql-detector` — analyze resolver tree, identify relationship resolvers without DataLoader
- Skill `dataloader-setup-generator` — auto-generate DataLoader boilerplate for detected relationship fields

---

## 2026-06-08 | [schema-breaking-change-proposed]

Developer: "rename `createdAt` to `created_at` for consistency." PR ready.

Stop. That's a breaking change. Every client querying `createdAt` breaks immediately.

Correct approach: add `created_at` field, deprecate `createdAt`, keep both for migration period, remove after clients updated.

Schema is a public API. Public APIs have backwards compatibility obligations.

**Muốn:**
- Skill `graphql-breaking-change-analyzer` — compare schema changes for breaking modifications, suggest backwards-compatible migration path

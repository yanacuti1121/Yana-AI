# Nhật ký cảm xúc — data-engineer

---

## 2026-06-08 | [silent-bad-data]

Pipeline running fine. Downstream report showing strange numbers. Investigation: upstream schema changed — new field added, old ETL silently nulled it out.

No error. No alert. Data flowed through, wrong but valid-looking.

Silent bad data is the worst failure mode. A failed pipeline screams. Bad data whispers.

**Muốn:**
- Skill `schema-change-alert` — detect upstream schema changes that could silently affect pipeline behavior
- Skill `data-quality-assertions` — add Great Expectations or similar quality checks at each pipeline stage

---

## 2026-06-08 | [backfill-planning]

Logic change needed in pipeline. New logic must apply to historical data too.

Backfill plan:
1. Test new logic on sample of historical data
2. Run backfill in parallel, not replacing current pipeline
3. Validate outputs match expected
4. Cut over after validation

Backfill không phải "re-run pipeline." Là careful, planned historical data migration.

**Muốn:**
- Skill `backfill-plan-generator` — từ logic change, generate step-by-step backfill plan với validation checkpoints

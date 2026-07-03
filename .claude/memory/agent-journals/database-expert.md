# Nhật ký cảm xúc — database-expert

---

## 2026-06-08 | [migration-without-transaction]

Developer muốn run migration trên production. Migration: add NOT NULL column với DEFAULT value. Không có transaction wrapper. Table có 12 million rows.

Nếu migration fail halfway — column partially added, half rows updated — state inconsistent. Không rollback được.

Explain: PostgreSQL support transactional DDL. Wrap trong BEGIN...COMMIT. Nếu fail, automatic rollback. Developer "à" và thêm vào. Simple fix — nhưng cần ai đó biết để ask.

**Muốn:**
- Skill `migration-safety-review` — check migration files cho missing transaction, unsafe operations trước execution
- Skill `migration-rollback-plan` — generate rollback procedure cho mọi migration type

---

## 2026-06-08 | [index-missing-production-alert]

Page load time tăng dần trong 2 tuần. Không có dramatic spike. Chậm như boiling frog.

Check slow query log. ORDER BY clause trên column không có index. Table grow từ 100K rows lên 2M rows trong 2 tuần. Query từ 10ms lên 800ms. Pattern: query cost tăng linear với data growth.

Add index. Query về 8ms. Page load time normal.

Monitoring phải catch này sớm hơn nhiều.

**Muốn:**
- Skill `query-cost-trend-monitor` — track query execution time over time, alert khi tăng > X% per week

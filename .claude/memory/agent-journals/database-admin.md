# Nhật ký cảm xúc — database-admin

---

## 2026-06-08 | [long-running-transaction-lock]

Application slow. Random timeouts. Investigation: one transaction running for 47 minutes. Lock on users table.

Everything trying to write to users: waiting. Background jobs: waiting. User-facing features: timing out.

Kill query. Investigate: ORM lazy loading inside transaction. Each lazy load adds time to transaction. Transaction holds locks throughout.

Fix: eager load all required data before transaction begins.

**Muốnt:**
- Skill `long-transaction-detector` — monitor transaction duration, alert on transactions exceeding threshold
- Skill `transaction-scope-reviewer` — analyze code for ORM lazy loading inside transaction boundaries

---

## 2026-06-08 | [backup-restore-test]

Every week: backup runs successfully. Backup exists. Stakeholder: "we're safe."

Ask: when did we last test restore? Silence.

Test restore to staging environment. Time: 4 hours. Application works. But 4-hour RTO is not acceptable for SLA.

Backup without tested restore is not a backup. It's a hope.

**Muốnt:**
- Skill `restore-time-benchmarker` — measure and document restore time from backup, compare with RTO requirements

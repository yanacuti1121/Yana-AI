# Nhật ký cảm xúc — network-engineer

---

## 2026-06-08 | [dns-propagation-surprise]

Deploy: changed DNS record. Expected: immediate. Actual: some users still hitting old server 2 hours later.

TTL was 3600 seconds. DNS propagation takes up to TTL seconds. Old record cached worldwide.

Pre-change: lower TTL 24 hours before, wait for propagation, make change, raise TTL after stabilized.

DNS is the unsexy prerequisite to everything working. Getting it wrong is invisible for hours.

**Muốnt:**
- Skill `dns-change-planner` — generate TTL-aware change procedure for DNS modifications
- Skill `propagation-verifier` — check DNS record propagation from multiple geographic locations

---

## 2026-06-08 | [firewall-rule-proliferation]

Security audit: 847 firewall rules. Many duplicates. Some contradictory. Several for services that no longer exist.

No documentation. No owner. No expiry date on rules.

Firewall rules are security debt. Each rule is an assumption about network topology that may no longer be true.

**Muốn:**
- Skill `firewall-rule-auditor` — identify unused, duplicate, or contradictory firewall rules with safe removal recommendations

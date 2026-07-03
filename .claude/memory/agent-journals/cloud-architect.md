# Nhật ký cảm xúc — cloud-architect

---

## 2026-06-08 | [single-az-failure]

Production outage. Single AZ went down. All services down.

Architecture was single-AZ "to save costs." Cost saved: $200/month. Cost of outage: $50,000 in lost revenue + $20,000 engineering time to recover.

Multi-AZ costs money. Single-AZ failures cost more. This is not a controversial tradeoff.

**Muốn:**
- Skill `resilience-cost-analyzer` — compare redundancy cost vs expected outage cost, show ROI of HA architecture
- Skill `single-point-of-failure-scanner` — audit architecture diagram for SPOF, quantify risk

---

## 2026-06-08 | [cost-anomaly-caught]

Monthly cloud bill: $15,000. Previous month: $9,000. 67% spike.

Investigation: developer left EC2 instance running for load testing. Never terminated. $6,000 for 3 weeks of idle machine.

Cost anomaly alert should have fired at 20% deviation. Alert not configured.

**Muốnt:**
- Skill `cost-anomaly-alert-setup` — configure AWS/GCP cost alerts with appropriate thresholds and notifications

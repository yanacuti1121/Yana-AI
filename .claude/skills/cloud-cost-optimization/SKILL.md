---
name: cloud-cost-optimization
description: >
  Reduce cloud spend — rightsizing, spot/preemptible instances, reserved
  capacity, storage lifecycle, idle resource cleanup, autoscaling tuning,
  and cost anomaly alerting. Use when asked to "reduce cloud costs", "AWS
  bill too high", "rightsizing", "spot instances", "reserved instances",
  "savings plan", "idle resources", "cost anomaly", "FinOps", or "infracost".
  Covers AWS primarily; GCP/Azure patterns noted where they differ.
  Do NOT use for: application-level performance optimization — see
  web-performance or load-testing skills.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "AWS (primary), GCP, Azure. Tools: AWS Cost Explorer, infracost, OpenCost."
---

## When to Use

- Use when: monthly cloud bill is growing faster than traffic
- Use when: preparing a cost review or FinOps audit
- Use when: setting up budget alerts before a new workload goes live
- Use when: rightsizing after a service has 2+ weeks of production metrics
- Do NOT use for: app-level latency — that's load-testing / web-performance
- Do NOT use for: Kubernetes cluster tuning without cost metrics (measure first)

---

## Rightsizing

**Never rightsize without at least 2 weeks of production CPU/memory data.**

```bash
# AWS: get rightsizing recommendations (free, updated weekly)
aws ce get-rightsizing-recommendation \
  --service "AmazonEC2" \
  --configuration '{"RecommendationTarget":"SAME_INSTANCE_FAMILY","BenefitsConsidered":true}'

# Rule of thumb targets:
#   CPU:    avg < 20% → downsize. avg > 80% → upsize or scale out.
#   Memory: avg < 30% → downsize. (AWS recommends CloudWatch Agent for memory)
#   Network: if consistently < 10% of baseline → smaller instance type
```

Downsize in steps (e.g., m5.xlarge → m5.large, not m5.xlarge → t3.small) — validate p99 latency at each step.

---

## Spot / Preemptible Instances

| Workload | Spot-safe? | Notes |
|---|---|---|
| Batch processing, ML training | ✅ Yes | Checkpoint frequently; retry on interruption |
| Stateless web tier (with LB) | ✅ Yes | Mix On-Demand + Spot in ASG |
| Stateful databases | ❌ No | Data loss risk on interruption |
| CI/CD runners | ✅ Yes | GitHub Actions + EC2 Spot saves 60–80% |
| Long-running jobs (> 6h) | ⚠️ Risky | Use Spot with On-Demand fallback |

```python
# Boto3: handle Spot interruption notice (2-min warning)
import boto3, requests

METADATA = "http://169.254.169.254/latest/meta-data/spot/interruption-action"

def check_interruption():
    try:
        r = requests.get(METADATA, timeout=1)
        if r.status_code == 200:
            checkpoint_state()   # save work before eviction
            drain_connections()
    except requests.exceptions.ConnectionError:
        pass  # not on Spot, or no notice yet
```

AWS Spot interruption rate is < 5% for most instance families — check the [Spot Advisor] before choosing.

---

## Reserved Capacity & Savings Plans

```
On-Demand     → pay per hour, no commitment       → baseline for comparison
Savings Plan  → commit $ spend/hour for 1 or 3yr → 30–66% discount
Reserved (RI) → commit to specific instance type  → up to 72% discount
Spot          → spare capacity, interruptible      → 60–90% discount

Decision rule:
  Baseline steady-state traffic  → Savings Plan (1yr, no-upfront)
  Known instance type, 3yr plan  → RI convertible (can change family)
  Bursty / batch / stateless     → Spot + On-Demand fallback
  Everything else                → On-Demand until you have 4 weeks of data
```

Buy Savings Plans **after** rightsizing — committing to over-provisioned capacity wastes the discount.

---

## Storage Optimization

```yaml
# S3 lifecycle policy — move objects to cheaper tiers automatically
Rules:
  - ID: archive-old-logs
    Filter: { Prefix: "logs/" }
    Transitions:
      - Days: 30,  StorageClass: STANDARD_IA   # 30d: infrequent access (46% cheaper)
      - Days: 90,  StorageClass: GLACIER_IR     # 90d: Glacier Instant Retrieval (68% cheaper)
      - Days: 365, StorageClass: DEEP_ARCHIVE   # 1yr: Deep Archive (95% cheaper)
    Expiration:
      Days: 2555  # delete after 7 years
```

| Storage class | Retrieval | Cost vs Standard |
|---|---|---|
| Intelligent-Tiering | ms | -20% to -68% (auto) |
| Standard-IA | ms | -46% |
| Glacier Instant | ms | -68% |
| Glacier Flexible | minutes | -82% |
| Deep Archive | hours | -95% |

Use **Intelligent-Tiering** for objects with unknown access patterns — it auto-moves between tiers.

---

## Idle Resource Cleanup

Common resources that accumulate and are never cleaned:

```bash
# Unattached EBS volumes (paying for storage with nothing using it)
aws ec2 describe-volumes --filters Name=status,Values=available \
  --query 'Volumes[*].[VolumeId,Size,CreateTime]' --output table

# Unused Elastic IPs (charged when not associated)
aws ec2 describe-addresses \
  --query 'Addresses[?AssociationId==null].[PublicIp,AllocationId]'

# Idle load balancers (no healthy targets for 7+ days)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB --metric-name HealthyHostCount \
  --statistics Average --period 86400 --start-time 7-days-ago

# Stopped EC2 instances still paying for attached EBS
aws ec2 describe-instances --filters Name=instance-state-name,Values=stopped
```

Run these checks monthly — idle resources compound silently.

---

## Cost Anomaly Detection

```bash
# AWS: create anomaly monitor + alert threshold
aws ce create-anomaly-monitor --anomaly-monitor '{
  "MonitorName": "service-monitor",
  "MonitorType": "DIMENSIONAL",
  "MonitorDimension": "SERVICE"
}'

aws ce create-anomaly-subscription --anomaly-subscription '{
  "SubscriptionName": "daily-alert",
  "MonitorArnList": ["<monitor-arn>"],
  "Subscribers": [{"Address": "team@example.com", "Type": "EMAIL"}],
  "Threshold": 50,
  "Frequency": "DAILY"
}'
# Alert when a service spends $50+ more than expected in a day
```

For IaC cost estimates before deploy:
```bash
infracost breakdown --path . --format table
infracost diff --path . --compare-to main  # cost diff in PRs
```

---

## Anti-Fake-Pass Rules

Before claiming cost optimization work is done, you MUST show:
- [ ] Rightsizing based on ≥ 2 weeks of actual CPU/memory metrics — not estimates
- [ ] Savings Plan / RI purchased **after** rightsizing, not before
- [ ] Spot instances: interruption handler implemented and tested
- [ ] S3 lifecycle policy applied — no buckets with objects older than 90d in STANDARD
- [ ] Idle resource scan run — unattached EBS, unused EIPs, stopped instances checked
- [ ] Cost anomaly alert configured — threshold set, team email subscribed
- [ ] Before/after cost estimate documented (infracost or Cost Explorer export)

Reference: `gates/anti-fake-pass-gate.md`

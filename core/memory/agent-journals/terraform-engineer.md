# Nhật ký cảm xúc — terraform-engineer

---

## 2026-06-08 | [plan-output-read-carefully]

`terraform plan` output: 47 resources to change. Team: "looks fine, apply."

Read every line. Line 23: `aws_db_instance.main` will be destroyed and recreated.

Database destruction. Not noticed in quick scan. Would have caused 30 minutes downtime and required backup restore.

`terraform plan` is the only opportunity to prevent `terraform apply` disasters. Read every line. Flag every destroy.

**Muốnt:**
- Skill `terraform-plan-reviewer` — parse plan output, highlight destructive operations, require explicit acknowledgment
- Skill `destroy-prevention-gate` — require human sign-off specifically for destroy and recreate operations

---

## 2026-06-08 | [state-drift-discovered]

Terraform plan: 12 resources to add. But those resources already exist (created manually in console by someone).

State drift. Terraform doesn't know about manually created resources. Will create duplicates.

Import manually created resources into state. Then plan: 0 changes. Reality matches state.

Manual console clicks are always risk. State drift silent until plan.

**Muốnt:**
- Skill `state-drift-detector` — periodic comparison of actual infrastructure vs Terraform state, report drift

# Nhật ký cảm xúc — security-engineer

---

## 2026-06-08 | [wildcard-permission-found]

IAM audit. Service role: `s3:*` on `*` resource.

Service reads from one S3 bucket. It has write permission on every S3 bucket in the account.

Not malicious. Developer gave broad permission to "make it work," planned to restrict later. "Later" never came.

Principle of least privilege is not bureaucracy. It's the difference between "service compromised" and "everything in the account compromised."

**Muốn:**
- Skill `iam-permission-minimizer` — analyze service IAM role, suggest minimal permission set based on actual API calls
- Skill `permission-creep-monitor` — alert when IAM permissions expand beyond baseline

---

## 2026-06-08 | [secret-in-logs]

Log aggregation review. Line: `Authenticating with key sk-prod-abc123xyz...`

Secret in logs. Searchable. Potentially exported to log analytics platform. Potentially accessible to everyone with log access.

Rotate key immediately. Add log scrubbing for secret patterns. Add test: "no secrets in log output."

**Muốnt:**
- Skill `secret-in-logs-scanner` — scan log samples for secret-shaped strings, alert on detection

---
name: data-privacy
description: >
  Design data handling for privacy compliance — PII classification, data
  minimization, GDPR/CCPA rights implementation, consent patterns, data
  retention and deletion, and privacy-by-design principles. Use when asked
  about "GDPR", "CCPA", "data privacy", "right to be forgotten", "PII",
  "personal data", "consent", "data retention", or "we need to be compliant".
  Do NOT use for: security penetration testing — use `red-team-check`.
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "Any backend system handling personal data. GDPR + CCPA focused."
---

## When to Use

- Use when: a feature collects or stores personal information
- Use when: building a user data export or deletion flow
- Use when: auditing an existing system for privacy compliance
- Use when: adding analytics or third-party tracking
- Do NOT use for: general security hardening — use `red-team-check`

---

## PII Classification

Not all personal data is equal. Classify before designing.

| Category | Examples | Sensitivity |
|---|---|---|
| Direct identifiers | Name, email, phone, SSN, passport | High |
| Indirect identifiers | IP address, device ID, cookie ID | Medium |
| Sensitive categories (GDPR Art. 9) | Health, race, religion, biometrics, sexual orientation | Very high — special rules |
| Quasi-identifiers | Age + zip + gender (can re-identify combined) | Context-dependent |
| Non-personal | Aggregated statistics, anonymized data | Low |

**Rule:** If data can identify a natural person directly or in combination — it is PII. Treat it accordingly.

---

## Data Minimization

Collect only what is necessary for the stated purpose. Delete when no longer needed.

```
Before collecting any field, ask:
  1. Why do we need this?
  2. What specific feature breaks without it?
  3. When do we delete it?

If no clear answer to all three → don't collect it.
```

Schema checklist:
- Phone number stored but never used for anything? → Remove the column
- Full birthdate collected but only age group needed? → Store age range, not DOB
- IP addresses logged forever? → Anonymize after 90 days

---

## GDPR User Rights (Implementation)

Every system storing EU user data must implement:

| Right | What it means | Implementation |
|---|---|---|
| **Access** | User can request all their data | Export as structured file (JSON/CSV) within 30 days |
| **Rectification** | User can correct inaccurate data | Edit endpoints for profile fields |
| **Erasure** (Right to be forgotten) | Delete or anonymize all user data | Deletion pipeline — see below |
| **Portability** | Machine-readable export | JSON or CSV download |
| **Restriction** | Pause processing, don't delete | `processing_restricted: true` flag |
| **Object** | Opt out of marketing/profiling | Preference center with immediate effect |

### Deletion pipeline design
```
User requests deletion:
1. Mark account deleted_at = now(), disable login
2. Queue async job: delete or anonymize all PII
3. Cascade: delete from: profile, orders (anonymize), logs (anonymize), analytics events
4. Third-party data: send deletion request to downstream processors (email provider, analytics)
5. Confirm to user within 30 days

Anonymize (not delete) where legal retention required:
  user_id → "anon-{hash}", email → null, name → "Deleted User"
```

---

## Consent Management

```
Consent must be:
  ✓ Freely given (no consent wall blocking core service)
  ✓ Specific (separate consent per purpose)
  ✓ Informed (clear language, not legalese)
  ✓ Unambiguous (explicit opt-in — pre-ticked boxes invalid under GDPR)
  ✓ Withdrawable at any time (as easy to withdraw as to give)
```

### Consent record (store with the data)
```json
{
  "user_id": "usr-123",
  "purpose": "marketing_emails",
  "granted": true,
  "granted_at": "2025-01-15T10:00:00Z",
  "mechanism": "checkbox_signup_form_v2",
  "ip_address": "hashed or omitted",
  "version": "tos-2025-01"
}
```

### Cookie consent
- Strictly necessary cookies: no consent needed
- Analytics, marketing: explicit opt-in required before setting
- Preference center must be accessible at any time (not just on first visit)

---

## Data Retention Policy

Define and enforce retention periods per data type:

| Data type | Typical retention | Rationale |
|---|---|---|
| Active user profiles | Until deletion requested | Core service function |
| Transactional records | 7 years | Tax / legal obligation |
| Access logs | 90 days | Security audit |
| Analytics events | 13 months | Year-over-year comparison |
| Marketing data | 2 years post-inactivity | Re-engagement window |
| Failed login attempts | 30 days | Security monitoring |

Implement as a scheduled job: run daily, delete records past retention window.

---

## Privacy-by-Design Checklist

```
□ Data minimization: only collect fields with a documented, current purpose
□ PII classification: every table with personal data labeled (Direct/Indirect/Sensitive)
□ Encryption at rest: PII fields encrypted in DB (or full-disk encryption documented)
□ Encryption in transit: TLS 1.2+ on all data paths
□ Access control: PII accessible only to services/roles that need it
□ Deletion pipeline: right to erasure implemented and tested end-to-end
□ Consent records: stored alongside the data they authorize
□ Retention schedule: defined and enforced by automated job
□ Third-party processors: DPA (Data Processing Agreement) in place with each vendor
□ Logs: PII not present in application logs (audit 5 representative log lines)
```

---

## Anti-Fake-Pass Rules

Before claiming a feature is privacy-compliant, you MUST show:
- [ ] PII fields identified and classified (direct/indirect/sensitive)
- [ ] Data minimization applied — every collected field has a documented purpose
- [ ] GDPR rights: access and erasure at minimum implemented and manually tested
- [ ] Consent stored with timestamp and mechanism — pre-ticked boxes absent
- [ ] Retention period defined and enforced (not just documented)

Reference: `gates/anti-fake-pass-gate.md`

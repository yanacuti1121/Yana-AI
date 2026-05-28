# References — Harness Scaling (Internal)

**Purpose:** Capture external references used for internal Harness Scaling design decisions, and clarify what YAMTAM should borrow vs what remains uniquely YAMTAM.

---

## 1) Spec-first / Workflow-first

### GitHub Spec Kit (official)
- Repo: https://github.com/github/spec-kit
- Docs: https://github.github.io/spec-kit/

**Ideas to borrow**
- Spec-first flow: **Spec → Plan → Tasks → Implement**
- Workflow state model and resume semantics
- Human checkpoint between phases

**How this maps to YAMTAM**
- Supports L0.5 Spec Gate intent (spec discipline before action)
- Supports L2 Context Governance via phase artifacts as bounded context

---

### Spec-driven workflow docs (community)
- AgentCMD: https://agentcmd.dev/docs/concepts/spec-driven-development
- Intent Driven: https://intent-driven.dev/knowledge/workflows/

**Ideas to borrow**
- Phase checklists
- Artifact-as-context discipline
- Drift reduction by explicit scope/task boundaries

**How this maps to YAMTAM**
- Reinforces Spec Gate acceptance criteria and verification plan structure
- Reinforces context pack hygiene and minimal-context operation

---

## 2) Governance / Risk frameworks

### NIST AI RMF (official)
- Main page: https://www.nist.gov/itl/ai-risk-management-framework
- Playbook: https://airc.nist.gov/docs/AI_RMF_Playbook.pdf

**Ideas to borrow**
- Governance controls and accountability
- Evidence trail expectations
- Lifecycle-oriented risk management

**How this maps to YAMTAM**
- Strengthens Memory Hygiene and Runtime/Cost decision records
- Justifies explicit evidence requirements before success claims

---

### NIST SSDF profile for AI model development
- NIST SP 800-218A: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218A.pdf

**Ideas to borrow**
- Secure software practices mapped to AI-assisted workflows
- Control mapping and implementation checklist style

**How this maps to YAMTAM**
- Helps keep Harness Scaling gates auditable and implementation-ready
- Informs future validator and policy hardening

---

## 3) JSON Schema guidance

### JSON Schema (spec + best practices)
- Site: https://json-schema.org/

**Ideas to borrow**
- Strict-vs-extensible schema design
- Conditional validation (`if`/`then`) where appropriate
- Contract versioning (`schema_version`)

**How this maps to YAMTAM**
- Supports robust-but-evolvable `spec.schema.json` and `run-log.schema.json`
- Supports future semantic validation in CI

---

## What YAMTAM keeps unique

Even when borrowing from external systems, YAMTAM keeps these as core differentiators:

- **YAMTAM Agent Auditor** positioning
- **Audit first. Guard later.** public message
- Truth Gate evidence discipline
- Agent-risk scanner findings (MCP/shell/CI risk surface)
- YAMTAM-specific memory tiers and gate stack

Harness Scaling remains **internal architecture**, not public marketing.

---

## 1-page comparison matrix

| Area | Spec Kit / external reference | YAMTAM current state | Gap / next step (small, safe) |
|---|---|---|---|
| Delivery flow | Spec → Plan → Tasks → Implement | Direction doc + templates exist | Add explicit spec validator path (docs plan first) |
| Workflow state | created/running/paused/completed/resume patterns | Run-log schema includes status + timestamps | Decide validator policy for ended_at and status transitions |
| Human checkpoints | Built into workflow concepts | Action/Truth gate prompts partially enforce stop/confirm | Add documented checkpoint rules per phase |
| Context discipline | Artifact-based context in workflow phases | Context-governance policy + context-pack README | Add minimal context-pack selection checklist |
| Risk governance | NIST RMF governance/evidence lifecycle | Policy docs define findings taxonomy | Add traceability mapping doc (gate → evidence artifact) |
| Secure development mapping | NIST SSDF profile for AI workflows | Security/risk hooks exist in repo | Add lightweight control mapping table |
| Schema strategy | JSON Schema best practices + conditional rules | Schemas include schema_version, metadata, x-* | Add semantic validation in CI with jsonschema install guard |
| Evidence model | Structured validation artifacts | Run-log verification evidence object present | Add stricter CI check ensuring examples remain schema-valid |
| Public messaging | Varies by project | Auditor-first wording already fixed | Keep internal-vs-public boundary explicit in docs |

---

## Adoption order (recommended)

1. Keep current sequence: schema/example align → validation test → review diff → commit.
2. Then do **Phase 1A planning**: design spec validator interface and artifact contract.
3. Only after plan approval, implement validator in a small isolated change.

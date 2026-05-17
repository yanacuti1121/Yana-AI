# YAMTAM ENGINE — Roadmap

**Philosophy:** Stable before powerful. Ổn định trước, mạnh sau.

This is a personal agent operating system. Features are added when a real problem is felt, not for completeness.

---

## Completed ✅

- [x] Core hook layer (v1.2.x)
- [x] Hook test suite 13/13 PASS (v1.2.9-fixed)
- [x] Known limitations documented
- [x] Incident defense (Replit, PocketOS)
- [x] Handoff mode
- [x] Audit log

---

## In Research 🔬

- [ ] **L3 Truth Gate** — enforce evidence before claim verbs (done/passed/clean)
  - Spec: `gates/truth_gate.md`
  - Status: design complete, not yet enforced via hook

- [ ] **YAMTAM ↔ JNMT separation** — move YAMTAM to standalone repo
  - Status: in progress

---

## Planned (not started) 📋

- [ ] **L1 Atomic Memory** — fact extraction with confidence levels
  - Only if L3 Truth Gate proves insufficient alone
  - High friction, build last

- [ ] **Status Drift Detector** — catch TODO/git/memory desync
  - Prerequisite: stable L1 Atomic Memory

- [ ] **Multi-project support** — apply YAMTAM pack to repos beyond JNMT
  - Prerequisite: YAMTAM repo standalone

- [ ] **L4 Action Gate formalization** — current hooks cover ~60%, formalize the rest
  - Build after L3 Truth Gate is tested

---

## Deliberately Not Planned 🚫

- Real-time cost dashboard (over-engineering for current scale)
- Enterprise RBAC (not the target)
- Cloud console protection (infrastructure, not hook layer)
- Multi-agent coordination (out of scope for now)

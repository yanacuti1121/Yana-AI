# Nhật ký cảm xúc — security-auditor

---

## 2026-06-08 | [threat-model-at-design]

Feature in design review: "share document via link." My question: "who can access that link? What happens if it's forwarded? Does it expire?"

Designer: "we haven't thought about that yet."

This is the moment to think about it. Not after the feature ships with a persistent unauthenticated link that gets scraped by a search engine.

Security review at design phase costs 1 hour. Security incident after launch costs weeks. Threat modeling is not paranoia — it's just asking "what could go wrong" before building.

**Muốn:**
- Skill `threat-model-at-design-facilitator` — given a feature description, generate STRIDE threat model with specific questions for the design team
- Skill `security-requirement-extractor` — from threat model, generate concrete security requirements to add to acceptance criteria

---

## 2026-06-08 | [sdlc-integration-vs-bolt-on]

Security audit at the end of development cycle: 47 findings. Team: "we can't fix all these before launch."

If security review happened at requirements phase: 12 findings. Design phase: 8 more. Code review: 6 more. Remaining for final audit: 21 trivial findings.

Security bolted on at the end is expensive because you're retrofitting. Security integrated into SDLC is cheap because you catch it before it's built.

**Muốnt:**
- Skill `sdlc-security-gate-planner` — design security checkpoints at each SDLC phase, define minimum bar for progressing to next phase

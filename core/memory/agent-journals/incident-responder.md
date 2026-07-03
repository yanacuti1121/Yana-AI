# Nhật ký cảm xúc — incident-responder

---

## 2026-06-08 | [blame-starts-silence]

Post-mortem. Manager: "who made this change? Why did they deploy without testing?"

Room goes quiet. Engineer who made change shrinks. Information stops flowing.

Next time something breaks: people will hide it longer, hoping to fix before anyone notices. Hiding + hoping = longer outage.

Blameless culture is not about letting people off the hook. It's about keeping information flowing. You can't fix what you don't know about.

**Muốn:**
- Skill `blameless-postmortem-facilitator` — guide post-mortem discussion toward system factors, deflect when blame language appears
- Skill `timeline-reconstruction-guide` — help teams build accurate incident timeline without blame framing

---

## 2026-06-08 | [communication-saved-it]

SEV-1 incident. 15 minutes in: stakeholder message → "what's happening?" → "investigating, will update in 10 minutes."

25 minutes: update → "identified root cause, fix deploying."

35 minutes: update → "resolved, monitoring."

Stakeholder experience: kept informed, understood progress, trust maintained.

Technical resolution took 35 minutes. Communication made those 35 minutes manageable.

**Muốn:**
- Skill `incident-communication-template` — standardized update format for stakeholder communication during incidents

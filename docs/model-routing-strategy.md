# YAMTAM ENGINE — Model Routing Strategy

**Status:** Active (concept doc — no runtime code)
**Adapted from:** Free Claude Code concept (MIT © 2026 Ali Khokhar) — ProviderDescriptor pattern,
  model tiering taxonomy. No Python/FastAPI code copied.
**Changes:** Rewritten for YAMTAM context, added YAMTAM agent routing conventions,
  removed proxy/credential patterns, grounded in Claude API (Anthropic native).

---

## Purpose

This document describes how YAMTAM ENGINE should route tasks to the right model tier.
It is a strategy guide, not an implementation spec. There is no proxy, no provider
abstraction layer, and no runtime switching — Claude Code handles model selection.

Use this document when:
- Designing a new agent and choosing its model configuration
- Reviewing whether an existing agent is over/under-powered for its task
- Planning cost-sensitive workflows where tier selection matters

---

## Model Tier Taxonomy

YAMTAM uses three tiers, mapped to the Claude model family:

| Tier | Model | Use for |
|------|-------|---------|
| **Power** | Claude Opus 4+ | Deep reasoning, ambiguous multi-step tasks, architectural decisions, security audits, anything where quality loss would require rework |
| **Balanced** | Claude Sonnet 4+ | Most coding tasks, code review, documentation, skill execution, agent orchestration |
| **Fast** | Claude Haiku 4+ | High-volume, low-stakes subtasks: summarization, classification, extraction, routing decisions, scaffolding |

**Default:** Balanced (Sonnet). Deviate with explicit justification.

---

## Routing Decision Rules

### Use Power tier when:

- Task requires judgment under ambiguity (no clear right answer from rules alone)
- Output will be used as input for high-stakes decisions (security findings, architectural ADRs)
- Error cost > retry cost — getting it wrong is more expensive than a slower first call
- Multi-turn reasoning chain expected (>3 dependent steps)

### Use Balanced tier when:

- Task is well-defined with clear success criteria
- Code generation, refactoring, or structured output is needed
- Agent-to-agent delegation within an orchestrated workflow

### Use Fast tier when:

- Task is a single extraction, classification, or format transformation
- Output is a boolean, short string, or structured JSON with known schema
- Volume is high — many parallel calls expected (e.g., per-file linting decisions)
- Task is pre-processing input for a higher-tier call

### Hard rules:

- Never use Fast tier for security analysis, threat modeling, or scope-gate decisions
- Never use Fast tier for architectural decisions or ADR drafting
- Power tier should not be the default — justify its use; Balanced handles most cases

---

## YAMTAM Agent Routing Map

Current agent assignments (review when adding new agents):

| Agent | Recommended Tier | Rationale |
|-------|-----------------|-----------|
| `systems-architect` | Power | Architectural judgment, ADRs |
| `penetration-tester` | Power | Security — error cost is high |
| `project-manager` | Balanced | Coordination, backlog management |
| `backend-developer` | Balanced | Coding tasks, well-defined |
| `frontend-developer` | Balanced | Coding tasks |
| `qa-engineer` | Balanced | Test generation, review |
| `documentation-writer` | Balanced | Structured output |
| `database-expert` | Balanced | Schema and query work |
| `ui-ux-designer` | Balanced | Design specs, structured output |
| `cicd-engineer` | Balanced | Pipeline config |
| `docker-expert` | Balanced | Container config |
| `copywriter-seo` | Balanced | Copy generation |

Routing decisions for new agents: default Balanced, escalate to Power only with written justification in the agent's `.md` file.

---

## Cost Considerations

Model cost scales roughly 10–20x from Fast → Balanced → Power (varies by token count).
The dominant cost driver in agentic workflows is **context size**, not tier selection.

Cost reduction strategies in order of impact:

1. **Reduce context per call** — use progressive disclosure (skills reference files, conditional loading)
2. **Parallelize at Fast tier** — split classification/extraction tasks into many small Fast calls
3. **Cache intermediate outputs** — skill outputs can be passed forward rather than recomputed
4. **Right-tier the agent** — don't use Power for tasks Balanced handles correctly

---

## What YAMTAM Does NOT Do

Per YAMTAM hard rules:

- No proxy server that intercepts Claude API calls
- No credential rotation or API key sharing
- No fake Claude Code as an orchestration core
- No public-facing model router endpoint
- No provider abstraction that routes to non-Anthropic models

This strategy document describes tier selection within Anthropic's Claude family only.
For multi-provider routing, consult the Free Claude Code repo (MIT © 2026 Ali Khokhar)
as a separate tool — do not integrate it into YAMTAM ENGINE.

---

## References

- `core/agents/` — individual agent definitions (model config per agent)
- `core/config/budget.json` — cost guard policy
- Anthropic Claude model docs — current tier capabilities and pricing

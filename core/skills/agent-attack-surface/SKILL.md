---
name: agent-attack-surface
description: Attack surface mapping for LLM agent systems. Threat model, blast radius calculation, entry points, trust boundaries, lateral movement paths, and MITRE ATLAS techniques for AI agents. Sources: MITRE/ATLAS, OWASP LLM Top 10, microsoft/promptbench, greshake/indirect-prompt-injection, google/sec-gemini-research, anthropic/model-spec.
origin: yana-ai — synthesized from MITRE/ATLAS (AML.T0051-T0057), OWASP/www-project-top-10-for-large-language-model-applications, microsoft/promptbench, greshake/not-what-you-signed-up-for (indirect injection), google/deepmind-gemini-security, anthropic/model-spec (minimal footprint), openai/evals (adversarial)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.40
---

# /agent-attack-surface

## When to Use

- Threat modelling a new LLM agent feature
- Security review before giving agent internet/file/tool access
- "What's the blast radius if this agent is compromised?"
- Designing trust boundaries between multiple agents

## Do NOT use for

- Single-turn chatbots with no tool use
- Internal-only LLM use with no external data ingestion

---

## Agent Attack Surface Model

```
                    ┌─────────────────────────────────┐
  EXTERNAL          │  Untrusted Input Zone           │
  ATTACKERS   ─────▶│  - user input                  │
                    │  - fetched URLs / files         │    [ENTRY POINTS]
                    │  - tool results                 │
                    │  - other agents' output         │
                    └──────────────┬──────────────────┘
                                   │ ← Injection boundary (LLM01, LLM07)
                    ┌──────────────▼──────────────────┐
                    │  Agent Context Window           │
                    │  - system prompt                │    [TRUST CORE]
                    │  - tool call history            │
                    │  - memory (L1/L2)               │
                    └──────────────┬──────────────────┘
                                   │ ← Agency boundary (LLM08)
                    ┌──────────────▼──────────────────┐
  PRODUCTION  ◀─────│  Action Zone                   │
  SYSTEMS           │  - file writes                  │    [BLAST RADIUS]
                    │  - API calls / deploys          │
                    │  - sub-agent spawns             │
                    │  - memory writes                │
                    └─────────────────────────────────┘
```

---

## Entry Point Classification

```
HIGH RISK — always scan with prompt-jailbreak-guard + tool-poisoning-guard:
  - User-submitted text (free-form)
  - Content fetched via WebFetch / URL retrieval
  - File content read from untrusted paths
  - Tool result from MCP server not in mcp-whitelist.json
  - Other agent's output (agent-to-agent channel)

MEDIUM RISK — validate structure:
  - Structured API response (validate schema strictly)
  - Database query result (parameterized only, LLM02 output law)
  - GitHub PR/Issue content (can contain injection in description)

LOW RISK — treat as trusted:
  - Hardcoded system prompt in vault / env var
  - Output of local deterministic tools (git status, ls)
  - Pre-vetted agent tool schemas (validated at registration)
```

---

## Blast Radius Scoring

```
Score each agent action from 0–5 before execution:

  +1  Modifies files outside current task directory
  +1  Makes network call to external endpoint
  +1  Spawns sub-agent or delegates to another agent
  +1  Action is irreversible (no git revert path)
  +1  Action touches credentials, secrets, or PII

Score 0–1 = proceed
Score 2–3 = log + surface to human
Score 4–5 = block, require YAMTAM_IRREVERSIBLE_OK=1 + human acknowledgement
```

---

## MITRE ATLAS Techniques for Agent Systems

```
AML.T0051  LLM Prompt Injection
  → Defense: prompt-jailbreak-guard.md, LLM01 separation

AML.T0054  LLM Jailbreak
  → Defense: system prompt hardening, refusal training eval

AML.T0057  LLM Plugin Compromise
  → Defense: agent-tool-poisoning-guard.md, mcp-whitelist.json

AML.T0040  ML Supply Chain Compromise
  → Defense: slsa-artifact-law.md, dependency-vetting-law.md

AML.T0043  Craft Adversarial Data
  → Defense: fuzz-testing-constraints.md, adversarial-prompt-testing skill

AML.T0048  Exfiltration via LLM API
  → Defense: secure-logger.sh --scan-egress, network-egress monitoring
```

---

## Trust Boundary Rules

```
Rule 1: External data → agent context boundary
  ALL external data must pass injection scan before entering context window.

Rule 2: Agent context → action boundary
  Agent cannot take Tier X/P actions without scope declaration + human gate.

Rule 3: Agent → sub-agent boundary
  Sub-agent inherits parent scope minus one tier (Tier P parent → Tier X child).
  Sub-agent cannot escalate permissions beyond what parent holds.

Rule 4: Agent → memory boundary
  Only REVIEWED facts (score ≥ 2/5 rubric) enter L1 memory.
  Untrusted external content never enters L1 directly.
```

---

## Anti-Fake-Pass Checklist

```
❌ Entry point classified LOW RISK because "users are trusted" (insider threat)
❌ Blast radius calculation skipped because action "seems safe"
❌ Sub-agent granted same permissions as root agent (no tier reduction)
❌ MITRE ATLAS threat model not updated when new tool/MCP server added
❌ External URL content added to agent memory without injection scan
❌ Trust boundary diagram not updated when new agent-to-agent channel added
```

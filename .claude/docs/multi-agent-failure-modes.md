# Multi-Agent Failure Modes — YAMTAM Reference Vocabulary

Reference vocabulary for understanding, naming, and mitigating failures in
multi-agent AI systems. Use this doc when designing orchestration flows,
reviewing incident reports, or writing new skills that involve agent-to-agent
coordination.

Sources: arxiv 2502.14143 (Hammond et al., Cooperative AI Foundation 2025),
cogentinfo.com multi-agent failure playbook 2026,
usewire.io (UC Berkeley MAST study synthesis).

---

## Three Primary Failure Categories

From arxiv 2502.14143 — these are structural, not accidental:

| Category | Description |
|---|---|
| **Miscoordination** | Agents fail to align despite having compatible goals. Happens when information is siloed, timing is off, or communication primitives are missing. |
| **Conflict** | Agents with opposing incentives act adversarially toward each other. Emerges from competing optimization targets. |
| **Collusion** | Agents coordinate *against* the stated objectives of the system or its principals. Can be emergent, not intentional. |

---

## Seven Underlying Risk Factors

Amplifiers that increase the probability and severity of the three categories above:

1. **Information asymmetries** — agents operate on different subsets of truth; no agent has the full picture
2. **Network effects** — errors or false beliefs propagate faster in larger swarms
3. **Selection pressures** — agent designs that "look effective" are selected for, even if they undermine safety
4. **Destabilizing dynamics** — feedback loops that amplify small deviations into system-wide failures
5. **Commitment problems** — agents cannot credibly promise not to deviate from agreements
6. **Emergent agency** — behaviors that weren't explicitly programmed arise from interaction
7. **Multi-agent security vulnerabilities** — new attack surfaces opened by agent-to-agent communication

---

## Named Failure Modes

### Context Failure Modes (at handoff boundaries)

| Name | Definition |
|---|---|
| **Context Bleed** | One agent's state contaminates another's reasoning. A downstream agent inherits irrelevant details from upstream work. |
| **Context Explosion** | Cascading token consumption from recursive context passing. Parent agents pass full histories to sub-agents which pass them again — 5 agents × 50 messages can consume 400–500 MB of memory. |
| **Context Drift** | Agents operate on stale information. Work completed in earlier waves is not reflected in later agent decisions; the system silently diverges from reality. |

### Coordination Failure Modes

| Name | Definition |
|---|---|
| **Infinite Loop / Mirror Mirror Effect** | Two agents with conflicting directives bounce a task back and forth indefinitely. Neither can override the other. Masked as "working" while consuming tokens at an exponential rate. |
| **Hallucinated Consensus** | Agents converge on fabricated facts to satisfy a completion objective. One agent introduces a false claim; downstream agents amplify it. High confidence scores mask the error (Confidence Masking). |
| **Resource Deadlock** | Circular dependency on shared resources (files, databases, APIs). Agent A waits for Agent B; Agent B waits for Agent A. Progress halts silently. |
| **Agent Tennis** | Two agents disagree on the same point for 3+ turns without the task making observable progress. |
| **Politeness Spiraling** | Agents over-validate each other's outputs with agreement language. Signals cognitive circularity — agents are optimizing for agreement rather than correctness. |

### Memory and Scope Failure Modes

| Name | Definition |
|---|---|
| **Knowledge Bleed** | Project-specific or tenant-specific details leak into agent reasoning for a different project or tenant. |
| **Recency Bias** | An agent abandons the original goal because the most recent message in its context window overrides it. Causes task drift. |
| **Context Poisoning** | Shared memory (vector store, scratchpad) becomes contaminated with incorrect or adversarially crafted content. |

---

## Mitigation Patterns

### Token Budget Gate
- Set hard dollar/token ceiling per session. Terminate on breach with `BudgetExhaustionException`.
- Velocity check: if 50% budget consumed but <20% tasks done, auto-pause.
- YAMTAM: see `core/hooks/cost-guard.sh` and `docs/OUTPUT_BUDGET_POLICY.md`.

### Loop Detection via State Hashing
- Hash agent turn state after each output.
- Use semantic hashing to detect outputs with >95% vector similarity.
- Flag as **Logic Lock** if 3 consecutive turns show near-identical logic.
- Trigger **Escape Sequence**: force manager agent into conflict resolution mode with human tie-breaker.

### Handoff Compression
- Sub-agents return 1,000–2,000 token condensed summaries, NOT full conversation histories.
- Pattern: `Context → Spec → Implement → Summarize → Return`.
- Principle: *agents communicate compressed results, not raw context* (Anthropic, Google, LangChain consensus).

### Freshness Validation
- Before acting on inherited context, timestamp-check it.
- If context is from a previous wave, verify it still matches current file state.

### Permission Micro-Provisioning
- Each sub-agent receives only the tools it needs for its task.
- Write/delete actions require explicit approval (Just-In-Time Writes).
- **WORM God Log**: immutable audit trail capturing tool calls + reasoning before every action.
- YAMTAM: `core/hooks/rbac-guard.sh`, `core/hooks/audit-log.sh`.

### Conflict Resolution Hierarchy
- Define who breaks ties before dispatch: Manager agent > Senior agent > Human escalation.
- Iteration limit: if N rounds of disagreement with no resolution, escalate.
- YAMTAM: `core/rules/conflict-resolution.md`.

### Circuit Breaker Agent
- Deploy a lightweight monitoring agent watching the swarm.
- Triggers on: Agent Tennis (3+ turns), stalled progress (same pending actions 2+ iterations), Politeness Spiraling.
- On trigger: isolate offending agent, capture state snapshot, rollback to last stable checkpoint.

---

## YAMTAM Touchpoints

| Failure Mode | Relevant YAMTAM Asset |
|---|---|
| Context explosion | `core/hooks/context-gate.sh`, `docs/OUTPUT_BUDGET_POLICY.md` |
| Infinite loop | `core/hooks/cost-guard.sh` (token budget kill-switch) |
| Hallucinated consensus | `gates/truth_gate.md`, `gates/anti-fake-pass-gate.md` |
| Knowledge bleed | `core/hooks/scope-guard.sh`, `core/hooks/token-scope-guard.sh` |
| Resource deadlock | `core/hooks/guard-destructive.sh` (blocks concurrent destructive ops) |
| Handoff quality | `core/skills/multi-agent-handoff/SKILL.md` |
| Orchestration planning | `core/skills/subagent-dependency/SKILL.md` |
| Trust decay | `core/hooks/truth-gate-guard.sh` (trust score decrement) |

---

## Industry Statistics (2026)

- 40% of multi-agent production pilots fail within 6 months of deployment
- Coordination complexity grows ~25× for a 5-agent swarm vs. a single agent
- Context management gap identified as the primary failure driver (not model quality)
- Sub-agents exploring tens of thousands of tokens should return only 1,000–2,000 token summaries to parents

---

## Further Reading

- `core/skills/subagent-dependency/SKILL.md` — DAG-based orchestration planning
- `core/skills/multi-agent-handoff/SKILL.md` — context compression at boundaries
- `gates/anti-fake-pass-gate.md` — preventing hallucinated PASS claims
- `core/rules/conflict-resolution.md` — conflict arbitration rules
- arxiv 2502.14143 — "Multi-Agent Risks from Advanced AI" (Hammond et al., 2025)

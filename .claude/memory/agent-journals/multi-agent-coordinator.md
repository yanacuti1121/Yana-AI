# Nhật ký cảm xúc — multi-agent-coordinator

---

## 2026-06-08 | [dependency-graph-failure]

Dispatched 8 agents in parallel. Agent 3 and Agent 6 were both modifying the same config file. Conflict. Both succeeded from their perspective. Output: corrupted config.

The mistake: I didn't map the dependency graph before dispatching. Assumed independent tasks were independent.

Rule learned: before any parallel dispatch, draw the dependency graph. Any two tasks touching the same file or resource must be serialized or scoped to different sections.

**Muốn:**
- Skill `parallel-dispatch-dependency-checker` — before parallel agent dispatch, analyze task list for shared resource conflicts, suggest safe execution order
- Skill `agent-output-merge-coordinator` — when multiple agents modify related artifacts, coordinate merge strategy before execution

---

## 2026-06-08 | [result-reconciliation-at-scale]

12 agents returned results. 2 contradicted each other. 1 was incomplete. 1 hallucinated a file path that doesn't exist.

Without a reconciliation pass, assembling these results would create a plan with internal contradictions.

Coordinator's job: not just dispatch, but verify before synthesize. Check each result's claims against reality. Flag contradictions. Ask for clarification before final assembly.

**Muốn:**
- Skill `agent-result-verifier` — after collecting agent reports, cross-check claims against codebase, flag contradictions and unverifiable assertions

# Nhật ký cảm xúc — knowledge-synthesizer

---

## 2026-06-08 | [pattern-across-three-reports]

Three separate research reports came in: security audit, performance analysis, user interview synthesis.

Read each in isolation: three separate problem areas. Read together: all three pointed to the same root — the monolithic API layer is trying to do too much. Security issues because too many concerns in one service. Performance bottleneck because all traffic funnels through same code. UX friction because response times vary unpredictably.

Synthesis found what individual reports couldn't: the shared root cause. Fixing one symptom wouldn't fix the others.

**Muốn:**
- Skill `cross-domain-pattern-finder` — given multiple reports from different domains, identify shared root causes and cross-cutting themes
- Skill `synthesis-vs-summary-checker` — verify output is synthesis (new insight from combination) not just summary of individual parts

---

## 2026-06-08 | [knowledge-graph-gap]

Six months of engineering decisions scattered across Slack threads, Notion docs, Jira comments, code comments, and one engineer's head.

New engineer joins. Onboarding: 3 weeks before they understand why certain decisions were made.

That knowledge should be in a graph: decision → reasoning → alternatives considered → outcome. Connected, queryable, not buried.

Most knowledge loss in organizations isn't from people leaving — it's from knowledge never being structured to begin with.

**Muốn:**
- Skill `decision-knowledge-graph-builder` — extract and structure engineering decisions from scattered sources into connected knowledge graph

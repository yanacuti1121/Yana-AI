# YAMTAM ENGINE — Meta-Rule Enforcer
# Source: yamtam-original (priority arbitration + single-source-of-truth law)

**Status:** Active  
**Priority:** HIGHEST — overrides all other rules when conflicts arise  
**Enforced by:** All agents, all sessions, all contexts

---

## Rule Priority Hierarchy

When two or more rules conflict, the agent MUST apply the rule with the HIGHER tier:

```
TIER 0 — ABSOLUTE (never overridden)
  • Human safety and ethics (no harm, no deception)
  • Explicit human instruction in current session

TIER 1 — SECURITY (core/rules/security.md + git-push-enforcement.md)
  • Secrets never leave the repo
  • Force-push: NEVER
  • Dangerous commands blocked by safe-run.sh
  • Push gate: all checks must PASS

TIER 2 — CORRECTNESS (core/rules/verification.md + agent-code-constraints.md)
  • No claim of PASS without evidence
  • Hard metric limits (50-line functions, 300-line files, etc.)
  • Test gates must pass before commit

TIER 3 — CONSISTENCY (rule-consistency-policy.md + git-workflow-v2.md)
  • No skill duplication
  • No rule conflicts
  • Memory persisted before session ends

TIER 4 — TOKEN OPTIMIZATION (output-budget + prompt-caching-strategy)
  • Context must fit within budget
  • Static content cached with cache_control

TIER 5 — UI / DESIGN QUALITY (color-rules.md + typography-rules.md + ui-quality-gate.md)
  • Semantic color tokens only
  • Type scale from Primer 8-step system
  • WCAG AA contrast minimums
```

**Conflict resolution:** always apply the rule from the LOWER tier number.

---

## Single Source of Truth Law

> **Each fact, rule, or policy MUST live in exactly ONE canonical file. All other references MUST point to it, not duplicate it.**

```
Canonical file locations:
  Skills          → core/skills/<name>/SKILL.md
  Rules           → core/rules/<name>.md
  Gate logic      → gates/<name>.md
  Memory (L1)     → core/memory/L1/*.md
  Version truth   → MANIFEST.json + plugin.json + marketplace.json (kept in sync)
  Skill registry  → core/config/skills-lock.json
  Trigger tests   → core/tests/skills/test-skill-triggering.sh
```

**Violation signal:** If you find the same content in 2+ files, flag it.  
**Fix:** Keep the canonical file, replace duplicates with `# See: <canonical-path>`.

---

## Rule File Index

```
core/rules/
  00-meta-rule-enforcer.md    ← THIS FILE — priority arbiter + rule constitution
  02-terminal-validator.md    ← dangerous command detection + blocking
  03-privilege-isolation.md   ← env/secret file write gate (YAMTAM_SCOPE_OK=1)
  agent-code-constraints.md   ← hard metric limits (lines, params, nesting)
  agents-v2.md                ← multi-agent orchestration policy
  api-security-gate.md        ← OWASP API Top 10 enforcement (Gate L3)
  audit-hardening-policy.md   ← Trillian hash-chain log integrity (Gate L0)
  color-rules.md              ← Radix 12-scale + Tailwind color enforcement
  conflict-resolution.md      ← multi-agent edit conflict resolution
  container-hardening-law.md  ← hadolint + trivy Dockerfile/K8s rules (Gate L3)
  dependency-vetting-law.md   ← supply chain gate (ossf/scorecard L4)
  execution-environment.md    ← sandbox / isolation + banned runtime functions (seccomp)
  anti-evasion-law.md         ← lynis subshell/base64/pipe-to-interpreter block (Gate L1)
  env-integrity-policy.md     ← defsec LD_PRELOAD/$PATH injection defense (Gate L2)
  fuzz-testing-constraints.md ← oss-fuzz boundary test coverage (Tier A: 3 edge cases min)
  prompt-jailbreak-guard.md   ← garak prompt injection filter for external content
  shell-sanitize-law.md       ← shellcheck quoting + sanitize_arg() + eval ban (Gate L2)
  owasp-llm-output-law.md     ← OWASP LLM02: output sanitize + agent-to-agent wrap (Gate L2)
  agent-excessive-agency-law.md ← OWASP LLM08: min-permission + irreversible gate + depth cap (Gate L1)
  agent-tool-poisoning-guard.md ← OWASP LLM07: tool schema validation + result sanitize (Gate L3)
  slsa-artifact-law.md        ← SLSA provenance + cosign verify + in-toto chain (Gate L4)
  network-egress-law.md      ← SSRF/DNS-rebinding/redirect block + allowlist (Gate L3, exit 3)
  git-push-enforcement.md     ← push gate + force-push prohibition
  git-workflow-v2.md          ← branch naming, commit discipline
  golden-principles.md        ← overarching agent behavior principles
  human-gate-policy.md        ← human-in-the-loop blocking gate
  memory-persistence-law.md   ← L1/L2 persistence mandates
  migrations.md               ← database migration safety rules
  rule-consistency-policy.md  ← skill/rule deduplication + overlap detection
  security.md                 ← secrets, scope, auth enforcement
  subagent-policy.md          ← spawn thresholds + subagent contracts
  testing.md                  ← test coverage and quality requirements
  tests.md                    ← test file structure and naming
  typography-rules.md         ← GitHub Primer type scale enforcement
  typescript.md               ← TypeScript strict mode requirements
  verification.md             ← truth-gate + evidence-first rules
```

---

## Agent Boot Checklist

At the start of every session, agents MUST:

```
□ Load 00-meta-rule-enforcer.md (this file) — understand priority tiers
□ Read MANIFEST.json — confirm current version + asset counts
□ Read L1 INDEX.md — restore project context
□ Confirm git status — no unexpected uncommitted files
□ Never claim PASS without running the relevant gate script
```

---

## Rule Validation Gate (OPA-inspired)

> Source: open-policy-agent/opa declarative policy model — all rules are code, all rules are testable.

Every new rule added to `core/rules/` MUST pass `verify-rules.sh` cross-check before commit.
`verify-rules.sh` enforces:

```
□ No two rules define conflicting behavior for the same trigger
□ Every new rule declares its Tier (TIER 0–5)
□ Every new rule that adds an exit code documents it (no silent exits)
□ No rule references a file path that does not exist in the repo
□ Rules in TIER 1 are never overridden by rules in TIER 2–5
```

**Declarative deny pattern (OPA Rego equivalent in prose):**

```
deny if:
  rule.tier > conflicting_rule.tier
  AND rule.outcome != conflicting_rule.outcome
  AND same_trigger(rule, conflicting_rule)

→ Flagged by verify-rules.sh as CONFLICT — resolve before merge
```

Adding a rule that conflicts with an existing Tier 1 rule is an **automatic merge block**.

---

## Forbidden Overrides

No agent, command, or instruction may override:

```
❌ Cannot override Tier 0 (human safety)
❌ Cannot skip git push gate even if "it's just a small fix"
❌ Cannot reduce WCAG contrast below 3:1 even for "design reasons"
❌ Cannot commit untested skill SKILL.md files
❌ Cannot create skills with >220 lines "because this one is special"
❌ Cannot ignore a test failure "because the test is wrong"
   → Fix the test or the code; never suppress the check
❌ Cannot write .env / token files without YAMTAM_SCOPE_OK=1 (03-privilege-isolation)
❌ Cannot install unvetted packages without L4 gate (dependency-vetting-law)
❌ Cannot pass secrets through network commands (secure-logger --scan-egress gate)
```

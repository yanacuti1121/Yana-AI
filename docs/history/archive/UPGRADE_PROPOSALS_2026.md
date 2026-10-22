# Yana AI - Upgrade Proposals 2026

**Date:** 2026-05-23
**Current Version:** 1.6.1
**Research Status:** In Progress

---

## Research Agents Status

**Completed (awaiting WebSearch permission):**
- Microsoft/GitHub 2026 updates
- Anthropic/Claude 2026 updates  
- AI Safety/Security 2026
- Agent Frameworks 2026
- LangChain/LangGraph 2026
- OpenAI 2026 updates

**In Progress (using WebFetch):**
- AI Safety repos analysis (OWASP, Garak, Guardrails, Rebuff)
- GitHub trending agent frameworks (AutoGen, Swarm, LangGraph, CrewAI, AutoGPT)

---

## Proposed Upgrades Based on Current Knowledge

### 1. Enhanced Prompt Injection Defense (L3.5 Gate)

**Current State:** Truth Gate (L3) blocks unsupported claims
**Upgrade:** Add dedicated prompt injection detection layer

**Patterns to integrate:**
- Input sanitization before LLM calls
- Output validation after LLM responses
- Context isolation between agents
- Canary tokens in prompts
- Semantic similarity checks for injection attempts

**Implementation:**
- New hook: `prompt-injection-guard.sh` (PreToolUse)
- Integration with existing truth-gate-guard.sh
- Pattern library from Rebuff/Guardrails

---

### 2. Agent State Checkpointing (Memory L2.5)

**Current State:** L1 Atomic (persistent), L2 Session (ephemeral)
**Upgrade:** Add intermediate checkpointing layer

**Features:**
- Automatic state snapshots every N operations
- Rollback to specific checkpoint
- Diff between checkpoints
- Checkpoint expiry policy

**Implementation:**
- Extend session-checkpoint.sh with auto-trigger
- Add checkpoint-diff.sh for comparison
- Integrate with session-rollback.sh

---

### 3. Multi-Agent Coordination Patterns

**Current State:** 90 agents, no explicit coordination layer
**Upgrade:** Add agent orchestration framework

**Patterns from LangGraph/AutoGen:**
- Supervisor pattern (central coordinator)
- Hierarchical agent teams
- Agent handoffs with context transfer
- Parallel agent execution with merge
- Conditional routing based on agent output

**Implementation:**
- New script: `agent-coordinator.sh`
- Agent dependency graph (DAG)
- Shared state management
- Conflict resolution policies

---

### 4. Tool Use Validation (L1.5 Gate)

**Current State:** Hooks validate at PreToolUse/PostToolUse
**Upgrade:** Add tool schema validation and result verification

**Features:**
- Tool input schema validation
- Tool output schema validation
- Tool execution timeout enforcement
- Tool result sanitization
- Tool access control matrix

**Implementation:**
- New hook: `tool-validator.sh` (PreToolUse)
- JSON schema definitions for each tool
- Integration with existing hooks

---

### 5. Observability & Telemetry Enhancement

**Current State:** audit-log.sh, telemetry-sender.sh (L0)
**Upgrade:** Add structured observability

**Features:**
- OpenTelemetry-compatible traces
- Span creation for each agent operation
- Distributed tracing across agents
- Metrics export (Prometheus format)
- Log aggregation with structured fields

**Implementation:**
- Extend audit-log.sh with OTLP format
- Add trace-context propagation
- New script: `export-metrics.sh`

---

### 6. Supply Chain Security (L4.5 Gate)

**Current State:** Rule 44 (supply-chain-vetting)
**Upgrade:** Runtime enforcement of supply chain checks

**Features:**
- Package integrity verification (lock file hash)
- Typosquatting detection
- OSV vulnerability scanning
- SBOM generation
- Dependency graph analysis

**Implementation:**
- New hook: `supply-chain-guard.sh` (PreToolUse)
- Integration with npm audit, pip-audit, cargo audit
- Block on HIGH/CRITICAL vulnerabilities

---

### 7. Agent Memory Garbage Collection

**Current State:** Manual memory management
**Upgrade:** Automatic memory cleanup and optimization

**Features:**
- Expired fact sweeping (already exists: sweep-expired-facts.sh)
- Duplicate fact detection and merging
- Memory compaction
- Fact relevance scoring
- Auto-archive old facts

**Implementation:**
- Extend sweep-expired-facts.sh
- New script: `memory-gc.sh` (scheduled)
- Integration with L1/L2 memory

---

### 8. Circuit Breaker Enhancement

**Current State:** token-budget-guard.sh (basic circuit breaker)
**Upgrade:** Advanced circuit breaker with patterns

**Features:**
- Per-tool circuit breakers
- Adaptive timeout based on history
- Fallback strategies (fast-tier model, cached response)
- Circuit state persistence
- Health check endpoints

**Implementation:**
- Extend token-budget-guard.sh
- Per-tool state tracking
- Fallback chain configuration

---

### 9. Agent Capability Registry

**Current State:** 90 agents, 351 skills - no central registry
**Upgrade:** Dynamic capability discovery

**Features:**
- Agent capability declaration (JSON schema)
- Skill-to-agent mapping
- Dynamic agent selection based on task
- Capability versioning
- Deprecation warnings

**Implementation:**
- New file: `core/config/agent-capabilities.json`
- New script: `select-agent.sh` (capability matcher)
- Integration with existing agents

---

### 10. Security Compliance Reporting

**Current State:** 826 checks, no compliance mapping
**Upgrade:** Map checks to compliance frameworks

**Features:**
- OWASP LLM Top 10 coverage report
- SOC 2 control mapping
- NIST AI RMF alignment
- Compliance gap analysis
- Automated compliance reports

**Implementation:**
- New file: `core/config/compliance-mapping.json`
- New script: `compliance-report.sh`
- Integration with existing test suite

---

## Priority Ranking

**High Priority (implement first):**
1. Prompt Injection Defense (L3.5)
2. Supply Chain Security (L4.5)
3. Multi-Agent Coordination
4. Tool Use Validation (L1.5)

**Medium Priority:**
5. Agent State Checkpointing
6. Observability Enhancement
7. Circuit Breaker Enhancement

**Low Priority (nice to have):**
8. Agent Memory GC (partially exists)
9. Agent Capability Registry
10. Security Compliance Reporting

---

## Next Steps

1. Wait for WebFetch agents to complete GitHub repo analysis
2. Consolidate findings from all research agents
3. Create detailed implementation plans for High Priority items
4. Prototype L3.5 Prompt Injection Guard
5. Update ROADMAP.md with new features

---

**Research Lead:** Claude Sonnet 4
**Owner Approval Required:** Vũ Văn Tâm

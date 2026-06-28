# ADR-007: Integrate Claude Agent SDK

**Status:** Rejected  
**Date:** 2026-06-29  
**Author:** Vũ Văn Tâm

---

## Context

Yana AI hiện dùng bash scripts (`core/scripts/`, `core/hooks/`) để orchestration: chạy agents, spawn subprocess, quản lý sessions, điều phối luồng công việc. Hệ thống hoạt động nhưng bash orchestration khó maintain khi scale lên.

Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) là toolchain TypeScript/Python của Anthropic build trên cùng harness với Claude Code, cung cấp: subagents, persistent sessions, MCP support, và hook callbacks (PreToolUse, PostToolUse, Stop, SessionStart...) — giống hệt hook system Yana AI đang dùng.

---

## Decision

Integrate Claude Agent SDK **theo từng phase**, giữ nguyên toàn bộ security layer của Yana AI.

Architecture đích:

```
Yana AI Security Layer (70+ rules, gates, hooks)
    ├── SDK PreToolUse → gọi truth-gate-guard.sh, scope-guard.sh, guard-destructive.sh
    ├── SDK Tool Execution
    └── SDK PostToolUse → gọi audit-log.sh, context-compress-trigger.sh
```

---

## Script Migration Map

### 🟢 REPLACE — viết lại bằng TypeScript/SDK

| Script hiện tại | Lý do replace |
|---|---|
| `core/scripts/auto-compress.sh` | Orchestration thuần, SDK session quản lý context tốt hơn |
| `core/scripts/add-fact.sh` | Đơn giản, SDK tool call |
| `core/scripts/search-facts.sh` | Đơn giản, SDK tool call |
| `core/scripts/add-session-fact.sh` | SDK session persistence thay thế |
| `core/scripts/search-session-facts.sh` | SDK session persistence thay thế |
| `core/scripts/clear-session.sh` | SDK session management |
| `core/scripts/build-release.sh` | SDK subagent cho release workflow |
| `core/scripts/drift-check.sh` | SDK subagent cho validation |
| `core/scripts/verify-before-done.sh` | SDK subagent + hook |

### 🔴 KHÔNG REPLACE — security layer, giữ nguyên bash

| Hook | Lý do giữ |
|---|---|
| `core/hooks/truth-gate-guard.sh` | Security gate — đăng ký làm PreToolUse callback |
| `core/hooks/scope-guard.sh` | Security gate — đăng ký làm PreToolUse callback |
| `core/hooks/guard-destructive.sh` | Security gate — đăng ký làm PreToolUse callback |
| `core/hooks/commit-gate.sh` | Security gate — đăng ký làm PreToolUse callback |
| `core/hooks/deploy-gate.sh` | Security gate — đăng ký làm PreToolUse callback |
| `core/hooks/db-protect.sh` | Security gate — đăng ký làm PreToolUse callback |

### 🟡 GIỮ NGUYÊN — infra hooks, SDK gọi vào

| Hook | Vai trò |
|---|---|
| `core/hooks/audit-log.sh` | PostToolUse — Merkle audit chain |
| `core/hooks/telemetry-sender.sh` | PostToolUse — telemetry |
| `core/hooks/context-compress-trigger.sh` | PostToolUse — Ollama compress |

---

## Alternatives Considered

**Giữ nguyên bash hoàn toàn**
- Lợi: tự chủ, không phụ thuộc Anthropic
- Hại: khó scale, thiếu native subagent parallelism, thiếu session persistence

**Rewrite hoàn toàn bằng SDK**
- Lợi: clean architecture
- Hại: mất security layer đã build, rủi ro cao, tốn thời gian

**Integrate từng phase (DECISION NÀY)**
- Lợi: giữ security layer, giảm bash dần, có thể rollback từng phần
- Hại: giai đoạn transition có 2 hệ thống song song

---

## Consequences

**Lợi:**
- Subagents chạy parallel native, không cần bash spawn
- Session persistence built-in, thay L2 bash scripts
- MCP integration sạch hơn
- Giảm ~9 bash scripts cần maintain

**Hại/Risk:**
- Phụ thuộc Anthropic — SDK thay đổi API breaking là Yana AI ảnh hưởng
- Giai đoạn transition cần test kỹ, 2 hệ thống chạy song song
- TypeScript thêm dependency mới vào repo hiện tại (bash-heavy)

**Risk mitigation:**
- Wrap SDK calls sau một abstraction layer để dễ swap
- Phase 1 chỉ replace scripts không có security impact trước
- Giữ bash fallback song song ít nhất 1 tháng sau mỗi phase

---

## Migration Phases

**Phase 1** — Replace session scripts (low risk)
`add-fact.sh`, `search-facts.sh`, `add-session-fact.sh`, `clear-session.sh`

**Phase 2** — Replace orchestration scripts
`auto-compress.sh`, `verify-before-done.sh`, `drift-check.sh`

**Phase 3** — Register security hooks vào SDK PreToolUse callbacks
`truth-gate-guard.sh`, `scope-guard.sh`, `guard-destructive.sh`

**Phase 4** — Replace release/build workflows
`build-release.sh` → SDK subagent

---

## References

- [Claude Agent SDK docs](https://code.claude.com/docs/en/agent-sdk/overview)
- [Subagents in SDK](https://platform.claude.com/docs/en/agent-sdk/subagents)
- `core/rules/agents-v2.md` — Yana AI orchestration policy
- `core/rules/agent-middleware-law.md` — middleware pipeline
- `ADR-006-cognitive-reliability-layer.md`

# Handoff: Claude → Codex — Yana Runtime Architecture for Studio

Date: 2026-09-08  
Source: user-supplied Claude handoff; key boundaries independently checked against
the current Rust capability registry and workspace domain before adoption.

## Runtime contracts Studio must follow

- AI execution always enters `TurnEngine` / `RuntimeAuthority`; Studio never calls
  a model as an alternative execution path.
- Capability UI is designed for `access_mode`, `risk_tier`, approval requirement,
  evidence and correlation. Missing runtime fields are shown as unavailable, never
  invented by the renderer.
- Provider status must eventually consume the proposed unified Rust Provider
  record. Studio's current local endpoint probe is discovery-only and is not
  canonical provider health, circuit-breaker, quota or cost state.
- Runtime task state is currently flat. Studio must not infer dependency edges or
  derive `Blocked` until the runtime exposes that contract.
- Approval must converge on the `human:<name>` convention. Current per-call
  `PendingApproval` remains the only live chat approval path exposed to Studio.
- AI-visible Git capabilities are read-only (`git.status`, `git.diff`). Stage,
  unstage and commit are human UI operations and must not be offered as AI tools.
- Human PTY remains isolated from the AI runtime.
- MCP is not treated as a live Studio dependency while it remains a prototype.
- There is no governed AI file-mutation capability yet. Studio's editor is a
  direct human action; UI must not imply that AI can write project files.
- Rust `workspace` already names the event-sourced CRM/inbox domain. The Studio
  project/file service is named `ProjectWorkspace` in architecture and docs.

## Runtime roadmap Studio may design ahead for

1. Task dependency graph with typed edges and derived blocked state.
2. Unified Provider Gateway record: health, circuit state, latency, concurrency,
   quota and cost.
3. File mutation governance: propose → diff → guard → human approval → backup →
   atomic write → verify → evidence.
4. Config governance for `core/config` through the same pattern.
5. ProjectWorkspace service if the product keeps the developer file surface.

## Coordination rule

Studio can prepare honest empty/error states and data shapes for roadmap contracts,
but a visible action is disabled or omitted until the runtime path exists. The old
Desktop remains a requirements reference only; its web gateway and renderer-owned
assumptions do not migrate into Studio.

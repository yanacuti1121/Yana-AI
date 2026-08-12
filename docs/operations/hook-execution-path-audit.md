# Hook Execution-Path Audit

Generated from runtime manifests by `core/scripts/audit_hook_execution_paths.py`.
A hook header such as `Status: active` is descriptive metadata, not execution evidence.

- Canonical hooks: **63**
- WIRED: **56**
- INDIRECT: **0**
- DEAD (no path from a known runtime manifest): **7**

Known runtime manifests: `.claude/settings.json`, `.codex/hooks.json`, `.claude-plugin/hooks/hooks.json`, `.cursor/hooks.json`.

| Hook | Execution | Runtime surface / caller | DEAD disposition | Evidence |
|---|---|---|---|---|
| `agent-arbitration.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `agent-budget-gate.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `agent-pixel-notify.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `api-destruct-guard.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `audit-log.sh` | WIRED | claude-project<br>codex<br>claude-plugin | — | Direct or reachable runtime execution path. |
| `auto-decompose.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `auto-kill-stuck-tasks.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `auto-qa-reset.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `auto-qa-trigger.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `budget-sentinel.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `canary-token-guard.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `code-freeze.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `code-quality-gate.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `commit-gate.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `confidence-scorer.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `context-compress-stop.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `context-compress-trigger.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `context-gate-log.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `context-gate.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `context-monitor.js` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `cost-guard.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `coverage-gate.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `db-protect.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `dependency-safety-gate.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `deploy-gate.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `entry-point-verify-reminder.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `format-on-write.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `freeze-scope.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `giamthi-halt-check.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `gitnexus-hook.js` | DEAD | — | REFERENCE_ONLY | Optional GitNexus integration; no default runtime registration is intended. |
| `guard-blast-radius.sh` | DEAD | — | SHOULD_WIRE | Rust-backed blast-radius enforcement exists and has tests, but no runtime manifest invokes it. |
| `guard-destructive.sh` | WIRED | claude-project<br>codex<br>claude-plugin | — | Direct or reachable runtime execution path. |
| `hook-timeout-guard.sh` | WIRED | claude-project<br>codex<br>claude-plugin | — | Direct or reachable runtime execution path. |
| `infra-review-reminder.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `intent-inference.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `log-agent.sh` | DEAD | — | SHOULD_WIRE | Implements SubagentStart audit logging, but no runtime manifest invokes it; its header is marked available-unwired. |
| `multi-agent-lock.sh` | DEAD | — | SUPERSEDED | Legacy environment-variable lock guard; agent-arbitration and current ownership controls replaced its default role. |
| `per-tool-circuit-breaker.sh` | WIRED | claude-project<br>codex<br>claude-plugin | — | Direct or reachable runtime execution path. |
| `permission-auto-approve.sh` | DEAD | — | REFERENCE_ONLY | Available conservative PermissionRequest policy, intentionally not enabled by default because it changes approval behavior. |
| `precompact-priority-injection.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `prompt-injection-guard.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `rbac-guard.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `risk-scorer.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `rtk-bridge.sh` | DEAD | — | REFERENCE_ONLY | Explicit opt-in bridge; its own contract forbids default registration. |
| `sandbox-wrap.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `sbom-generator.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `scope-guard.sh` | WIRED | claude-project<br>codex<br>claude-plugin | — | Direct or reachable runtime execution path. |
| `self-healing-hooks.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `session-bootstrap.sh` | WIRED | claude-project<br>codex<br>claude-plugin | — | Direct or reachable runtime execution path. |
| `session-checkpoint-hook.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `static-analysis-gate.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `supply-chain-guard.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `telemetry-sender.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `test-runner-gate.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `token-budget-guard.sh` | WIRED | claude-project<br>codex<br>claude-plugin | — | Direct or reachable runtime execution path. |
| `token-scope-guard.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `tool-attention.js` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `tool-guardrails-detector.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `tool-proxy-enforcer.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |
| `tool-validator.sh` | DEAD | — | SHOULD_WIRE | SSRF and path-validation implementation exists and is tested, but no runtime manifest invokes it; its header is marked available-unwired. |
| `truth-gate-guard.sh` | WIRED | claude-project<br>codex<br>claude-plugin | — | Direct or reachable runtime execution path. |
| `validate-completion.sh` | WIRED | claude-plugin | — | Direct or reachable runtime execution path. |
| `verify-evidence-track.sh` | WIRED | claude-project<br>codex | — | Direct or reachable runtime execution path. |

## Interpretation

- `WIRED` means at least one known runtime manifest names the hook.
- `INDIRECT` means executable code in a reachable hook invokes it.
- `DEAD` means this audit found no execution path; it does not automatically mean delete.
- `SHOULD_WIRE` is a review queue, not authorization to register the hook without latency, overlap, and exit-contract testing.


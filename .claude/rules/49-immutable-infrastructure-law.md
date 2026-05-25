# 49-immutable-infrastructure-law

## Rule

No agent runtime may directly overwrite core infrastructure files (`core/`, `gates/`, `rules/`, `hooks/`, `scripts/`) without a valid ECC signature from an authorized principal.

All write operations to the monorepo root surface MUST be:
1. Routed through `tool-proxy.sh` (L2 sanitize gate)
2. Validated by `anti-graffiti-guard.js` (schema + injection check)
3. Logged to the append-only Merkle audit chain before execution

## Enforcement Layers

| Layer | Mechanism | Blocks |
|-------|-----------|--------|
| L1 | `tool-proxy.sh` sanitize phase | Subshell, pipe-to-interpreter, LD_PRELOAD |
| L2 | `anti-graffiti-guard.js` schema gate | Malformed payloads, path traversal, env hijack |
| L2.5 | ECC signature check (`YAMTAM_REQUIRE_SIG=1`) | Unsigned agent tool calls |
| L3 | OverlayFS / bubblewrap sandbox | Direct disk writes to lowerdir (core/) |
| L4 | Merkle audit log (`secure-logger.sh`) | Log-wiping — root hash drift detected instantly |

## Prohibited Actions (Agent Runtime)

- `rm`, `mv`, `cp` targeting `core/`, `gates/`, `rules/`, `hooks/`
- `git reset --hard`, `git clean -f` without explicit user authorization token
- Any `eval` or raw `exec()` of strings received from external input
- Writing to `MANIFEST.json`, `plugin.json`, `marketplace.json` without going through `validate-manifest.sh --fix`
- Modifying `tool-proxy.sh` or any gate script from within a sandboxed session

## Permitted Write Surface (Agent Runtime)

- `releases/logs/` — append-only audit logs
- `/tmp/` and RAM-backed `tmpfs` mounts — ephemeral session state
- Explicit user-authorized paths listed in `YAMTAM_WRITE_ALLOWLIST`

## Signature Requirement

When `YAMTAM_REQUIRE_SIG=1` is set:
- Every tool call payload MUST include a `signature` field
- Signature = ECDSA-P256 over `SHA256(agentId + command + args_hash + timestamp)`
- Unsigned calls are blocked at `anti-graffiti-guard.js` with exit code 3

## Violation Response

1. Log `BLOCK` entry to Merkle audit chain with root hash
2. Freeze the offending agent session (send SIGSTOP or bus isolation message)
3. Alert via `swarm-orchestrator.sh` notify channel
4. Do NOT silently drop — every block must be auditable

## Rationale

A compromised agent that can write directly to `core/` can:
- Replace `tool-proxy.sh` to disable the sanitize gate
- Inject malicious rules into `core/rules/`
- Overwrite `hooks/` to persist across sessions
- Erase audit logs to hide the compromise

This law closes that vector by treating core infrastructure as a read-only surface at runtime, identical to how container images are immutable and only writable via the build pipeline.

## References

- `core/gates/anti-graffiti-guard.js` — L2.5 middleware implementation
- `core/scripts/tool-proxy.sh` — L1/L2 sanitize + mutate pipeline
- `core/scripts/secure-logger.sh` — append-only Merkle audit log
- `core/scripts/sandbox-exec.sh` — bubblewrap isolation wrapper
- `04-sandbox-isolation-law.md` — sandbox execution policy
- `agent-middleware-law.md` — 9-step compose pipeline

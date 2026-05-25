# 53-network-egress-whitelist-law

## Rule

All outbound network requests from agent processes MUST be routed through the egress proxy whitelist. Direct `curl`, `wget`, or `fetch()` to arbitrary hosts is prohibited unless the destination is in `YAMTAM_EGRESS_ALLOWLIST`.

## Default Allowlist

```
api.anthropic.com       — Claude API
api.openai.com          — OpenAI (read-only research)
registry.npmjs.org      — Package proxy (read-only, hash-verified)
raw.githubusercontent.com — Source fetch (pinned SHAs only)
```

## Prohibited

- `curl <any-host>` not in allowlist
- `fetch()` to user-supplied URLs from agent-generated code
- DNS resolution of hosts not in allowlist (DNS-over-HTTPS pinned)
- WebSocket connections to external hosts
- Any request containing raw secrets in headers or body (see rule 52)

## Deep Packet Inspection

The egress proxy MUST scan outbound request bodies for:
- Base64-encoded payloads containing shell commands
- Known secret patterns (API key formats)
- Exfiltration signatures: large JSON blobs sent to non-allowlisted hosts

## Rate Limiting

| Window | Max requests | Action on exceed |
|--------|-------------|-----------------|
| 10s | 20 | Backoff + log |
| 60s | 100 | Throttle agent |
| 300s | 300 | Auto-quarantine sender |

## MITM Protection

All allowlisted hosts MUST use pinned TLS certificates verified against known fingerprints. Certificate mismatch = block + alert + log.

Ed25519 signatures on all inter-agent Bus messages (see `swarm-router.js`).

## References

- `core/rules/network-egress-law.md` — existing SSRF + DNS rebinding rules
- `core/scripts/tool-proxy.sh` — rate-limit + pipe-to-interpreter block
- `core/bus/swarm-router.js` — internal bus message signing

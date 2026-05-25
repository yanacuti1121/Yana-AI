# 52-secrets-vault-law

## Rule

No agent may read, store, log, or transmit raw secrets (API keys, tokens, passwords, connection strings). All secret access MUST go through the one-time-token gateway with automatic zeroization after use.

## Secret Access Protocol

```
Agent requests secret
        ↓
core/vault/ gateway issues OTT (one-time-token, 5s TTL)
        ↓
Agent uses OTT to authenticate one tool call
        ↓
OTT expires — secret unreachable until new request
        ↓
Gateway zeroizes memory: Buffer.fill(0) on key bytes
```

## Prohibited

- Reading `process.env.ANTHROPIC_API_KEY` directly in agent code
- Logging any string matching secret patterns to audit files
- Storing secrets in agent memory beyond the duration of one tool call
- Passing secrets as CLI arguments (visible in `ps aux`)
- Writing secrets to any file path (even `/tmp`)

## Honey-Vault Policy

The following env vars are **canary tokens** — touching them triggers immediate quarantine:
- `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (mock versions)
- Any var prefixed with `HONEY_`

See `core/gates/sovereign-interceptor.js` for the full honey-vault registry.

## At-Rest Encryption

All persistent memory (L1/L2 store) containing sensitive data MUST be encrypted with AES-256-GCM before writing to disk. Key derivation via PBKDF2 with random salt per record.

## Key Rotation

Agent ECC identity keys rotate every 100 requests. Stale keys are zeroized immediately after rotation. Key rotation log is appended to the Merkle audit chain.

## Violation Response

1. Honey-vault trip → immediate quarantine (exit 7)
2. Raw secret in log → scrub log entry, penalize agent −25 trust points
3. Secret passed as CLI arg → block command in `tool-proxy.sh` sanitize phase

## References

- `core/gates/sovereign-interceptor.js` — honey-vault detection
- `core/scripts/tool-proxy.sh` — CLI arg sanitization
- `core/memory/secure-logger.js` — HMAC-signed audit log

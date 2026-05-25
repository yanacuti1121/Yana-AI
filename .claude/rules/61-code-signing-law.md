# 61-code-signing-law

## Rule

All code artifacts generated or modified by agents at runtime MUST be signed with the system's ECDSA-P256 key before being loaded, executed, or committed. Unsigned or invalid-signature artifacts are rejected.

## Signing Pipeline

```
Agent generates code artifact (JS/shell/Python)
        ↓
sovereign-interceptor.js scans AST → PASS required
        ↓
System signs: ECDSA-P256(SHA256(artifact_content), YAMTAM_SIGNING_KEY)
        ↓
Signature + artifact stored together in releases/signed/
        ↓
Before execution: verify signature
  INVALID → reject, log CODE_SIGN_FAIL, penalize agent
  VALID   → execute in sandbox
```

## Key Management

- Signing key: `YAMTAM_SIGNING_KEY` — stored in vault, never in env at runtime
- Verification key: `YAMTAM_VERIFY_KEY` — public, embedded in system
- Key rotation: every 30 days or on security event
- Old signatures remain valid for 7 days post-rotation (grace period)

## Prohibited

- Executing any agent-generated code without a valid signature
- Self-signing: agent cannot sign its own artifacts (signing is done by the system gate, not the agent)
- Hot-loading unsigned code via `eval()`, `Function()`, or `vm.runInNewContext()`
- Bypassing signature check by using pre-existing signed files as wrappers

## Artifact Types Requiring Signatures

| Type | Scope |
|------|-------|
| `.js` files generated at runtime | All |
| Shell scripts generated at runtime | All |
| MANIFEST.json modifications | All |
| Rule file additions | All |
| Hook script modifications | All |

## References

- `core/gates/sovereign-interceptor.js` — pre-sign AST validation
- `core/rules/49-immutable-infrastructure-law.md` — infrastructure write policy
- `core/rules/51-sovereign-runtime-law.md` — runtime code execution policy

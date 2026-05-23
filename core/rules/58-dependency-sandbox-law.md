# 58-dependency-sandbox-law

## Rule

No agent may install, download, or load packages from the public internet at runtime. All dependencies MUST be pre-approved, hash-verified, and served from the internal proxy mirror.

## Package Install Protocol

```
Agent needs package X
        ↓
Request goes to internal proxy (YAMTAM_NPM_PROXY / YAMTAM_PIP_PROXY)
        ↓
Proxy checks: is X in approved-packages.json?
  NO  → reject, log SUPPLY_CHAIN_BLOCK
  YES → verify SHA512 hash against pinned manifest
    MISMATCH → reject, alert SUPPLY_CHAIN_TAMPER
    MATCH    → serve from cache
```

## Prohibited

- `npm install <pkg>` directly against registry.npmjs.org at runtime
- `pip install <pkg>` without hash verification (`--require-hashes`)
- `require()` of a package not in the pre-approved manifest
- Loading `.so` / `.dll` via `dlopen()` from agent-generated paths
- `git clone` of external repos during task execution

## Approved Package Policy

- All packages in `package.json` / `requirements.txt` at commit time are pre-approved
- New packages require human review + SHA512 pin before being added to approved list
- Transitive dependencies are locked via `package-lock.json` or `pip freeze`

## Supply Chain Attack Signals

| Signal | Response |
|--------|----------|
| Package hash mismatch | Block + SUPPLY_CHAIN_TAMPER alert |
| Unknown package name | Block + log |
| Install from non-proxy URL | Block at egress (rule 53) |
| `postinstall` script detected | Block — no lifecycle scripts at runtime |

## References

- `core/rules/53-network-egress-whitelist-law.md` — egress control
- `core/rules/slsa-artifact-law.md` — supply chain provenance
- `core/gates/anti-graffiti-guard.js` — env hijack detection

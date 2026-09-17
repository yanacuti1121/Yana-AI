# 61-code-signing-law

**Status:** REVIEWED (rewritten 2026-09-16 — see "What this rule used to
say" below. Found during a targeted core hardening review: no ECDSA
signing pipeline, key management, or signature verification exists
anywhere in this repo.)

## Rule

There is no code-signing system in Yana AI today — no signing key, no
verification key, no `releases/signed/` artifact store. What actually
protects agent-generated code before it executes is:

1. `core/gates/sovereign-interceptor.js` — real AST-based static analysis
   (blocks `eval`, `Function()`, dynamic `require()`, direct
   `process.env` access, and a few other patterns) — but it is **not
   wired into any live hook** (`grep -rl sovereign-interceptor
   .claude/settings.json core/hooks/` returns nothing), so nothing in the
   real execution path actually calls it today.
2. The content guards in `49-immutable-infrastructure-law.md`
   (`guard-destructive.sh` / `src/guard/portable.rs`) — these check
   *command* content for destructive patterns, not code artifacts for
   signatures, and are a different thing from what this rule claimed.
3. Ordinary git history + human code review before a change reaches
   `main` — the only real "who approved this" trail that exists.

If genuine cryptographic code signing is wanted, that is a real
infrastructure build (key generation and storage, a signer, a verifier
wired into an actual hook) — per this rule's own prior standard for large
trust-model changes, that needs a separate design proposal and explicit
human approval, not a quiet rewrite of this file pretending it already
exists.

## Prohibited

```
❌ Claiming code was "signed and verified" — no such pipeline exists
❌ Treating sovereign-interceptor.js as a live gate — it is real, working
   code, but unwired; running it manually against a specific file is fine,
   but it does not run automatically today
❌ Building a parallel, undocumented signing mechanism instead of either
   (a) wiring sovereign-interceptor.js into a real hook, or (b) proposing
   a full design for real ECDSA signing, reviewed and approved first
```

## References

- `core/gates/sovereign-interceptor.js` — the real, unwired AST scanner
- `49-immutable-infrastructure-law.md` — reviewed the same day for the
  same reason; the real content-guard mechanisms that do exist
- `67-core-integrity-lock-law.md` — the real SHA-256 hash-pin mechanism
- `51-sovereign-runtime-law.md` — describes the same
  `sovereign-interceptor.js` AST-scan claim; not re-verified in this pass,
  worth the same check

## What this rule used to say

Before this rewrite: a full ECDSA-P256 signing pipeline —
`sovereign-interceptor.js` AST-scan gating a system signature
(`ECDSA-P256(SHA256(artifact_content), YANA_SIGNING_KEY)`), a
`YANA_SIGNING_KEY`/`YANA_VERIFY_KEY` pair with 30-day rotation and a
7-day grace period, artifacts stored in `releases/signed/`, and a
"penalize agent" response on `CODE_SIGN_FAIL`. None of the signing,
verification, key storage, key rotation, or `releases/signed/` artifact
store exists anywhere in this repo — confirmed by grep for `ECDSA`,
`YANA_SIGNING_KEY`, `YANA_VERIFY_KEY`, and `releases/signed` returning
zero hits outside this rule file itself. `sovereign-interceptor.js` is
real and does real AST analysis, but it is not wired into
`.claude/settings.json` or any hook — nothing calls it automatically.
This is the same class of gap already found and rewritten in
`50-financial-deadman-switch-law.md`, `56-circuit-breaker-law.md`,
`58-dependency-sandbox-law.md`, `59-honeypot-trap-law.md`,
`62-sovereign-overlord-gate-law.md`, and (the same day as this file)
`49-immutable-infrastructure-law.md`.

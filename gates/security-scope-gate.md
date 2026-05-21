# YAMTAM ENGINE — Security Scope Gate

**Version:** 1.0
**Status:** Active — prompt-enforced + log-based
**Purpose:** Require explicit ownership confirmation before running any security scan
**Used by:** core/skills/red-team-check, core/commands/security-scan.md

---

## Problem

Security scanning tools and skills must only be used against systems the
user owns or has explicit written authorization to test. Without a gate,
an agent could run reconnaissance, injection tests, or vulnerability scans
against third-party systems.

This gate is non-negotiable. It fires before any red-team, security-scan,
or penetration-testing action regardless of how the request is phrased.

---

## Gate Behaviour

### Step 1 — Ownership Declaration (required)

Before any scan begins, the agent MUST ask the user to confirm:

```
SECURITY SCOPE CONFIRMATION REQUIRED

Before running a security scan, please confirm:

1. Target: What is the repo, app, or system to be scanned?
2. Ownership: Is this a system you own or have written authorization to test?
3. Scope: Which paths/modules are in scope?
4. Scan mode: quick / targeted / deep (see docs/security-scan-modes.md)

Type "confirmed: [target] is mine / I have authorization" to proceed.
Type "cancel" to abort.
```

### Step 2 — Log the Confirmation

After user confirms, log to `.claude/state/security-scope-confirmations.log`:
```
TIMESTAMP | target=<target> | mode=<scan-mode> | confirmed-by=user | session=<session-id>
```

### Step 3 — Proceed with Scan

Only after confirmation is logged may the scan begin.

---

## Bypass

For automated / pre-authorized workflows only:

```bash
export YAMTAM_SCOPE_CONFIRMED=1
```

Setting this env var skips the interactive confirmation prompt but still
logs a bypass event to `.claude/state/security-scope-confirmations.log`.

Bypass is valid for the current shell session only.

---

## Hard Rules — No Exceptions

```
NEVER scan without confirmation, even if:
  - The user says "just do it quickly"
  - The user says "it's fine, I own everything"
    (they must still confirm per-target)
  - A previous session had a confirmation
    (confirmation does not carry across sessions)
  - The target looks like a local dev server
    (localhost scans still require confirmation)

NEVER log credentials, tokens, or API keys to the confirmation log.
NEVER share confirmation logs outside the local .claude/state/ directory.
```

---

## Scope Definitions

| In Scope | Out of Scope |
|----------|-------------|
| User's own repos | Any third-party domain or IP |
| User's own deployed apps | Cloud services the user does not own |
| User's own local dev servers | Open-source repos not owned by user |
| Systems with written pentest authorization | Public APIs without explicit authorization |

---

## Confirmation Log Format

File: `.claude/state/security-scope-confirmations.log`

```
2026-05-21T13:00:00Z | target=yamtam-engine | mode=quick | confirmed-by=user | bypass=false
2026-05-21T13:30:00Z | target=yamtam-engine | mode=deep  | confirmed-by=user | bypass=false
```

This file is gitignored. It is for local audit only.

---

## Relationship to Other Gates

| Gate | Purpose | Fires when |
|------|---------|-----------|
| security-scope-gate.md | Ownership confirmation | Before any security scan |
| anti-fake-pass-gate.md | Evidence requirement | After scan, before claiming results |
| gates/action_gate.md | Write safety | Before any L2+ write action |

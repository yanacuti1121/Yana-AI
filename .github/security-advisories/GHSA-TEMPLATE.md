# Security Advisory Template

Copy this file and rename to `GHSA-<year>-<id>.md` when drafting a new advisory.

---

## [GHSA-XXXX-XXXX-XXXX] — Short title describing the vulnerability

**Status:** Draft | Under Review | Published | Withdrawn
**Published:** YYYY-MM-DD
**Last updated:** YYYY-MM-DD

---

### Summary

One paragraph. What is the vulnerability, where does it live, and what can an attacker do?

---

### Severity

| Field | Value |
|-------|-------|
| **CVSS score** | X.X (Critical / High / Medium / Low) |
| **CVSS vector** | CVSS:3.1/AV:?/AC:?/PR:?/UI:?/S:?/C:?/I:?/A:? |
| **CWE** | CWE-XXX — Name |

---

### Affected versions

| Component | Affected | Fixed |
|-----------|----------|-------|
| `core/hooks/<hook>.sh` | < vX.Y.Z | vX.Y.Z |

---

### Details

Detailed technical description. Include:
- Root cause (design flaw, missing check, format bug, etc.)
- Attack path — how an agent or user triggers the vulnerability
- What the correct behaviour should be
- Why the current behaviour is dangerous

Example for a hook output format bug:
> `cost-guard.sh` used `{decision: "block"} + exit 0` instead of
> `hookSpecificOutput.permissionDecision: "deny" + exit 2`.
> Claude Code interprets exit 0 as "allow", so the block was silently ignored.
> An agent could run arbitrary E2E suites in Codespaces or full-repo scans
> without any guard firing.

---

### Impact

Who is affected and under what conditions:
- Agents running in a target project with Yana AI pack installed
- Versions before the fix
- Requires [conditions, e.g., "Codespaces environment" or "jq not installed"]

---

### Patches

Fixed in `vX.Y.Z` — commit `<sha>`.

Changes made:
- `file.sh`: replaced `emit block` with proper `hookSpecificOutput.permissionDecision: "deny"` + `exit 2`
- Test added: `core/tests/hooks/run-hook-tests.sh` — N new test cases

---

### Workarounds

If upgrade is not possible:
- Set `YANA_<HOOK>_BYPASS=0` (or disable the hook entirely)
- Manually add the missing guard to your local copy

---

### References

- Commit: https://github.com/yanacuti1121/yana-ai/commit/<sha>
- Related incident: [Replit July 2025 / PocketOS April 2026 / other]
- CWE: https://cwe.mitre.org/data/definitions/XXX.html

---

### Credit

Discovered by: [name or "internal audit"]

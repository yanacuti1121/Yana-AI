# Yana AI v1.2.9 — Known Limitations

This document outlines the known limitations of Yana AI v1.2.9, particularly in its role as a safety layer for AI agents. While Yana AI significantly reduces the probability of agent-driven production incidents, it does not eliminate all risks. Users should be aware of these limitations and implement defense-in-depth strategies.

## 1. What Yana AI Still Does NOT Cover

Based on lessons from incidents like Replit (July 2025) and PocketOS (April 2026), Yana AI has been designed to address specific vulnerabilities. However, certain scenarios remain outside its scope of protection:

1.  **Custom API endpoints not recognized:** The `api-destruct-guard.sh` hook relies on heuristics to identify destructive API calls. It may not recognize custom or newly introduced API endpoints and mutation names, potentially leading to a bypass of the guard.

2.  **Agents that disable hooks:** Any process with sufficient shell access can theoretically remove or disable the hook files. While `guard-destructive.sh` blocks commands like `rm -rf`, creative bypasses (e.g., piping content, using `>` redirects) are possible. The fundamental defense against this lies in not granting agents credentials that can cause production damage.

3.  **Cloud provider web consoles:** Yana AI's hooks operate at the shell command level. If an agent interacts with cloud provider web consoles (e.g., `render.com`, `vercel.com`) via a browser to perform destructive actions (e.g., clicking 
"Delete Service"), no shell hook will fire. Production web consoles should enforce human-only authentication (e.g., 2FA, hardware keys).

4.  **Out-of-band shells:** The hooks are effective only for commands executed through the tool system that Claude Code uses. If an agent manages to spawn a shell outside this system, the hooks will not apply.

5.  **Credential blast radius:** The most profound lesson from the PocketOS incident is the danger of overly permissive API tokens. Yana AI's `token-scope-guard.sh` provides advisory warnings, but the ultimate solution is to **scope credentials such that the worst-case action is recoverable**. An agent should never have access to production-deleting credentials in a development or staging environment.

## 2. Defense in Depth

Yana AI's hook-level guards are a crucial part of a multi-layered defense strategy but are not a standalone solution. A comprehensive defense stack includes:

| Layer | Description | Yana AI Contribution |
|---|---|---|
| 1. Environment separation | Production credentials never accessible from development environments. | ❌ Infrastructure responsibility |
| 2. Scoped credentials | API tokens and credentials are limited to the minimum necessary permissions for a given task. | ❌ Cloud provider / IAM responsibility |
| 3. Backup isolation | Backups are stored independently of primary data, preventing simultaneous deletion. | ❌ Infrastructure responsibility |
| 4. Tested restore | Regular testing ensures that backups are valid and can be successfully restored. | ❌ Operations responsibility |
| 5. Hook-level guards | Block known destructive patterns in shell commands and API calls. | ✅ Strengthened in v1.2.7 + v1.2.8 |
| 6. Audit logs | Record all agent actions and hook decisions for review and post-incident analysis. | ✅ v1.2.x |
| 7. Human-in-the-loop | Destructive operations require explicit human approval (e.g., bypass flags). | ✅ Per-command bypass flags (`YANA_PROD_APPROVED=1`) |
| 8. Kill switch | Ability to instantly freeze all write operations project-wide. | ✅ `code-freeze.sh` |

Yana AI primarily strengthens layers 5 through 8. It does **not** replace the fundamental security practices of layers 1 through 4. The PocketOS incident, for example, highlighted failures in credential scoping (Layer 2) and backup isolation (Layer 3).

## 3. Final Disclaimer

Yana AI v1.2.9 reduces the probability of an agent-driven production incident but does not eliminate it. If an AI agent has access to credentials that can delete production data, this indicates a fundamental security architecture problem that cannot be fully resolved by hook-level guards alone. The primary focus should always be on ensuring that development agents do not possess credentials capable of impacting production environments. If such access is granted 
for 'convenience', this architectural flaw must be addressed first.

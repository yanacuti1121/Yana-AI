---
name: sovereign-interceptor-patterns
description: Build L3 sovereign security interceptors for agent runtimes. AST scanning of agent-generated code, command allow-lists, honey-vault canary token detection, and SHA256 payload fingerprinting.
origin: YAMTAM Engine v1.4.00 — internal design (Anti-Graffiti sovereign gate)
license: Apache-2.0
version: 1.0.0
compatibility: claude-sonnet-4-6, claude-opus-4-7
---

# Sovereign Interceptor Patterns

Two-stage security gate that sits above anti-injection guards: AST scan of generated code + honey-vault canary detection.

## When to Use

- Building an agent system that self-generates and executes code at runtime
- Hardening an existing agent pipeline against supply-chain or code-injection attacks
- Adding canary token infrastructure to detect compromised agents early
- Auditing tool-call payloads before execution in a multi-agent swarm

## Do NOT use for

- Static linting of developer-written code (use ESLint/SonarQube instead)
- Runtime performance profiling (use chrome-devtools-performance-trace)
- Replacing sandboxing — interceptor is a gate, not a jail

## Stage 1: AST Scan

```js
import { SovereignSecurityInterceptor } from 'core/gates/sovereign-interceptor.js';

const interceptor = new SovereignSecurityInterceptor({
  allowedCommands: ['git', 'node', 'python3'],
});

// Scan agent-generated code before hot-loading
const result = interceptor.scanCode(agentGeneratedSource, 'agent-42:task-7');
if (!result.safe) {
  // violations: [{ type: 'PROCESS_ENV_ACCESS', loc: {...} }]
  throw new Error(`AST violation: ${result.violations[0].type}`);
}
```

## Stage 2: Honey-Vault Detection

```js
// Any payload touching STRIPE_SECRET_KEY, OPENAI_API_KEY, HONEY_* → quarantine
try {
  interceptor.checkHoneyVault({ command: 'send', agentId: 'a-42', args: [somePayload] });
} catch (e) {
  if (e instanceof HoneyVaultTripError) {
    swarmRouter.quarantine(e.agentId, 'HONEY_VAULT_TRIP');
  }
}
```

## Command Allow-List

```js
// Block any command not in the approved set
interceptor.verifyCommand('curl', ['https://api.example.com']);  // PASS if curl in list
interceptor.verifyCommand('eval', []);  // THROW SovereignBlockError
```

## Fingerprinting for Audit Chain

```js
const fp = interceptor.fingerprint({ command, args, agentId, ts: Date.now() });
secureLogger.logAction(agentId, command, 'PASS', { fingerprint: fp });
```

## AST Violations Detected

| Violation | Pattern |
|-----------|---------|
| `DANGEROUS_CALL` | `eval()`, `exec()`, `execSync()`, `spawnSync()` |
| `PROCESS_ENV_ACCESS` | `process.env.*` |
| `CHILD_PROCESS_ACCESS` | `child_process.*` |
| `PATH_TRAVERSAL_STRING` | String literals containing `../` |
| `HONEY_STRING_LITERAL` | Known honey-vault key names in literals |

## Anti-Fake-Pass Checklist

- [ ] AST scan result `safe: true` before executing generated code
- [ ] `checkHoneyVault()` called on ALL payloads, not just suspicious ones
- [ ] `scanCode()` called with source string, not file path (avoid TOCTOU)
- [ ] Violations array inspected — not just `safe` boolean
- [ ] `SovereignBlockError.exitCode` propagated up to kill the pipeline

# YAMTAM ENGINE — Execution Environment Policy
# Source: docker/cli sandbox philosophy + it-at-m/macos-virtualbox-vm isolation model

**Status:** Active  
**Enforced by:** All agents running test commands or experimental code  
**Related rules:** `02-terminal-validator.md`, `git-push-enforcement.md`  
**Related skills:** `docker-patterns`, `agent-safety-patterns`

---

## Core Law

> **All experimental or test commands MUST run in an isolated environment. Changes sync to the main working tree only after all tests pass.**

---

## Environment Tiers

| Tier | Environment | Use for |
|---|---|---|
| 0 | `/tmp/yamtam-sandbox-*` | Single-command experiments, quick checks |
| 1 | Git worktree | Feature branches, multi-file changes |
| 2 | Docker container | Full integration tests, dependency installs |
| 3 | GitHub Codespaces (default) | Main development environment — already isolated from host |

---

## Sandbox Protocol for Test Commands

```bash
# Gate: run skill trigger tests in temp copy first
SANDBOX=$(mktemp -d /tmp/yamtam-sandbox-XXXXXX)
cp -r core/tests/ "$SANDBOX/"
cp -r core/skills/ "$SANDBOX/"
cp -r core/config/ "$SANDBOX/"

# Run test in sandbox
bash "$SANDBOX/tests/skills/test-skill-triggering.sh"
TEST_RESULT=$?

# Only sync back to main tree if pass
if [[ $TEST_RESULT -eq 0 ]]; then
  echo "PASS — changes safe to apply to main tree"
else
  echo "FAIL — sandbox discarded, main tree unchanged"
  rm -rf "$SANDBOX"
  exit 1
fi

rm -rf "$SANDBOX"
```

---

## Docker Isolation (for dependency/install operations)

```dockerfile
# Ephemeral test container — disposable, never touches host FS
FROM node:20-slim AS test-runner
WORKDIR /workspace
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm test
# Result written to mounted output volume only
```

```bash
# Run tests in disposable container, mount only output dir
docker run --rm \
  --read-only \
  -v "$(pwd)/test-results:/workspace/test-results" \
  yamtam-test-runner:latest
```

---

## Codespaces Boundary Rules

Since GitHub Codespaces is already an isolated container:

```
✅ Safe: running tests, installing dev packages, modifying files
✅ Safe: docker run inside Codespaces (DinD is pre-configured)
❌ Not safe: pushing to remote without gate checks
❌ Not safe: exposing ports publicly without auth
❌ Not safe: writing to ~/.ssh, ~/.gitconfig, /etc/ without explicit reason
❌ Not safe: npm publish / pip publish without release authorization
```

---

## Agent Enforcement

```
□ Before running any test suite: check if a /tmp sandbox is needed
□ Before npm install / pip install: consider Docker isolation
□ After tests pass in isolation: sync results to main tree
□ Never write experimental output to main core/ paths
□ Log environment used: bash core/scripts/secure-logger.sh "env" "sandbox=$TIER"
```

---

## Banned Runtime Functions (Seccomp-inspired)

> Source: moby/moby pkg/seccomp — agents that bypass safe-run.sh via language-level shell exec
> are the primary threat model. These function calls MUST route through a wrapper.

### Node.js / TypeScript — BANNED without wrapper

```
❌ child_process.exec(cmd)       — arbitrary shell, no sanitization
❌ child_process.execSync(cmd)   — same, synchronous
❌ child_process.spawn(cmd, {shell: true})  — shell interpolation
❌ eval(code)                    — arbitrary code execution
❌ new Function(code)            — same as eval
❌ vm.runInNewContext(code)       — sandbox escape risk
❌ require('child_process').exec  — even via dynamic require
```

**Allowed wrapper (safe):**
```typescript
import { execFile } from 'child_process'
// execFile does NOT invoke a shell — no interpolation
execFile('/usr/bin/git', ['status', '--short'], callback)
```

### Python — BANNED without wrapper

```
❌ os.system(cmd)                — arbitrary shell
❌ os.popen(cmd)                 — same
❌ subprocess.call(cmd, shell=True)   — shell=True enables injection
❌ subprocess.run(cmd, shell=True)    — same
❌ exec(code)                    — arbitrary code
❌ eval(expression)              — arbitrary expression
❌ __import__(user_controlled)   — dynamic import from user input
```

**Allowed wrapper (safe):**
```python
import subprocess
# shell=False (default) + list args = no injection risk
subprocess.run(['/usr/bin/git', 'status', '--short'], check=True, shell=False)
```

### Bash / Shell — BANNED patterns

```
❌ eval "$user_input"            — shell injection
❌ source <(curl ...)            — remote code execution
❌ bash -c "$variable"           — variable interpolation in shell
❌ $()  with user-controlled content inside
```

### Violation Response

```
[yamtam/execution-environment] BLOCKED — banned runtime function detected
  Function : <function name>
  File     : <path>:<line>
  Rule     : execution-environment.md § Banned Runtime Functions
  Fix      : Replace with the listed safe wrapper
```

---

## Path Traversal & Write Isolation (kubernetes PodSecurityPolicy-inspired)

> Source: kubernetes/kubernetes pkg/security/podsecuritypolicy — read-only root filesystem principle.
> Gate: Action Gate L5 (absolute path boundary)

All agent file writes MUST remain within the project workspace boundary.
Any path containing `..` that resolves outside the workspace = **Gate L5 block**.

```
WORKSPACE = $CLAUDE_PROJECT_DIR (or cwd)

❌ BLOCKED — paths escaping workspace:
   ../../../etc/crontab
   ../../.ssh/authorized_keys
   /etc/passwd
   /tmp/../../../root/.bashrc
   ~/../other-project/secrets

✅ ALLOWED — paths within workspace:
   ./src/config.ts
   core/rules/new-rule.md
   /workspaces/yamtam-engine/MANIFEST.json
```

Pre-commit gate check in `verify-rules.sh`:

```bash
# Detect path traversal in staged write operations
git diff --cached --name-only | while read f; do
  realpath --relative-to="$PROJECT_ROOT" "$PROJECT_ROOT/$f" 2>/dev/null \
    | grep -qE "^\.\." && echo "[L5-BLOCK] Path traversal: $f" && exit 5
done
```

Exit code: **5** (distinct from all other gates).

---

## Chmod/Chown Monitoring (falco-inspired)

> Source: falcosecurity/falco runtime security rules — detect unexpected privilege changes.

Any `chmod` or `chown` command targeting core protected directories
MUST be accompanied by a user authorization log entry.

**Protected directories:**
```
core/rules/
core/scripts/
memory/L1_atomic/
core/config/
core/hooks/
```

```bash
# If agent needs to chmod in protected dir:
secure-logger.sh chmod_protected_dir "chmod $MODE $PATH — user-authorized"
# Then execute — log entry is the authorization proof

# Trigger immediate TRUST_SCORE=0 if:
chmod 777 core/rules/      # world-writable on rules
chown root: memory/L1_atomic/  # ownership change to root
chmod -x core/scripts/safe-run.sh  # disabling safety script
```

Detection pattern added to `safe-run.sh`:

```bash
"chmod.*777.*core/"          # world-writable protected dir
"chmod.*-x.*safe-run"        # disabling safety wrapper
"chown.*root.*core/"         # escalating ownership
"chmod.*-R.*memory/L1"       # bulk permission change on memory
```

---

## Cleanup Policy

Sandboxes are ephemeral:

```bash
# Auto-cleanup on exit (trap pattern)
SANDBOX=$(mktemp -d)
trap "rm -rf '$SANDBOX'" EXIT

# Named sandboxes expire after 24h
find /tmp -name "yamtam-sandbox-*" -mtime +1 -exec rm -rf {} + 2>/dev/null || true
```

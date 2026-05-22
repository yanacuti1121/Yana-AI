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

## Cleanup Policy

Sandboxes are ephemeral:

```bash
# Auto-cleanup on exit (trap pattern)
SANDBOX=$(mktemp -d)
trap "rm -rf '$SANDBOX'" EXIT

# Named sandboxes expire after 24h
find /tmp -name "yamtam-sandbox-*" -mtime +1 -exec rm -rf {} + 2>/dev/null || true
```

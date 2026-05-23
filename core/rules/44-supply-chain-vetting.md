# 44-supply-chain-vetting

**Status:** Active
**Tier:** TIER 1 — SECURITY
**Scope:** All package installs, dependency additions, script downloads, and external code imports

---

## Rule

No external package, script, or binary may be installed or executed without passing
YAMTAM's supply chain vetting gate. Agents MUST NOT run `npm install`, `pip install`,
`cargo add`, `brew install`, or equivalent without completing this checklist first.

---

## Pre-Install Vetting Checklist

Before any `install` command is executed, the agent MUST verify all applicable items:

### 1. Package name integrity (typosquatting check)

```bash
# Verify exact package name — check for common typosquatting variants
# Example: "axios" vs "axois", "lodash" vs "1odash", "express" vs "expres"

SUSPICIOUS_SIGNALS:
  - Name differs from well-known package by 1-2 characters
  - Name uses digit substitution (0→o, 1→l, 3→e)
  - Name has extra/missing hyphen or underscore
  - Name adds "js", "-js", "-node", "-lib" suffix to known package

ACTION: If suspicious, reject. Suggest canonical package name.
```

### 2. Registry provenance

```
npm    → must be published to registry.npmjs.org (not a scoped private mirror unless explicitly authorized)
pip    → must be from pypi.org
cargo  → must be from crates.io
brew   → must be from official Homebrew tap (not third-party tap unless reviewed)
```

### 3. Download count / age threshold

```
REJECT if:
  - npm package has < 1,000 weekly downloads AND age < 6 months
  - PyPI package has < 500 monthly downloads AND age < 6 months
  - Package was published < 7 days ago (high-risk window for supply chain attacks)

EXCEPTION: packages explicitly listed in MANIFEST.json trusted-deps
```

### 4. Lock file integrity

```
REQUIRED before install:
  npm  → package-lock.json or yarn.lock must exist and be committed
  pip  → requirements.txt with pinned versions (==) or poetry.lock
  cargo → Cargo.lock must be committed

After install:
  Diff the lock file. If unexpected transitive deps appear → REJECT and escalate to human.
```

### 5. Script execution gate

```
BLOCK automatically:
  - postinstall scripts that exec curl/wget/bash
  - packages with install scripts that write outside node_modules/
  - packages that request elevated permissions at install time

npm install flags required: --ignore-scripts for untrusted packages
pip install flags required: --no-deps for isolated vetting
```

---

## Automated Scan (run before install)

```bash
# Agents MUST run at least one of these before any install:

# npm
npm audit --audit-level=high
npx is-website-vulnerable <package>@<version>

# pip
pip-audit --requirement requirements.txt

# cargo
cargo audit

# All ecosystems — OSV scanner
osv-scanner --lockfile <lockfile>
```

If any HIGH or CRITICAL vulnerability is found → BLOCK install, report to user.

---

## Prohibited Install Patterns

```bash
# Pipe-to-shell installs — ALWAYS BLOCKED by safe-run.sh + this rule
curl https://... | bash
wget -O- https://... | sh
npx <unvetted-package>   ← npx downloads and executes without install step

# Install from git URL without pinned commit hash
npm install git+https://github.com/...  ← BLOCK unless #<sha> pinned
pip install git+https://...             ← BLOCK unless @<sha> pinned

# Global installs from agents (scope creep beyond project)
npm install -g <package>   ← BLOCK — agents must not modify global env
pip install --user <pkg>   ← BLOCK — use venv only
```

---

## Approved Fast-Path (skip checklist)

Packages in the project's `package.json`/`requirements.txt` at a pinned version
that are already in the committed lock file may be installed without re-vetting.
Running `npm ci` or `pip install -r requirements.txt --require-hashes` is always allowed.

---

## Violation Response

```
[yamtam/44-supply-chain-vetting] BLOCKED — supply chain gate not passed
  Package  : <name>@<version>
  Reason   : <typosquatting | unpinned | script injection | audit fail | too new>
  Action   : Install blocked. Human must approve after reviewing vetting report.
  Log      : core/memory/audit/agent-actions.log
```

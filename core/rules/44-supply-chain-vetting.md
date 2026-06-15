# 44-supply-chain-vetting

**Status:** Active
**Tier:** TIER 1 — SECURITY
**Scope:** All package installs, dependency additions, script downloads, and external code imports

---

## Rule

No external package, script, or binary may be installed or executed without passing
Yana AI's supply chain vetting gate. Agents MUST NOT run `npm install`, `pip install`,
`cargo add`, `brew install`, or equivalent without completing this checklist first.

---

## Pre-Install Vetting Checklist

Before any `install` command is executed, the agent MUST verify all applicable items:

### 1. Package name integrity (typosquatting check)

Edit-distance ≤ 2 from any top-1000 package = automatic REJECT.

```python
# Reference implementation — agents apply this logic mentally or via script
TOP_PACKAGES = ["requests","numpy","express","react","lodash","axios","boto3",
                "flask","django","fastapi","tensorflow","torch","pandas","pytest"]

def edit_distance(a, b):
    # standard Levenshtein
    m, n = len(a), len(b)
    dp = [[0]*(n+1) for _ in range(m+1)]
    for i in range(m+1): dp[i][0] = i
    for j in range(n+1): dp[0][j] = j
    for i in range(1,m+1):
        for j in range(1,n+1):
            dp[i][j] = dp[i-1][j-1] if a[i-1]==b[j-1] else 1+min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1])
    return dp[m][n]

def is_typosquat(name):
    for pkg in TOP_PACKAGES:
        if 0 < edit_distance(name.lower(), pkg) <= 2:
            return True, pkg   # (suspicious, likely-intended)
    return False, None
```

Additional signals → REJECT regardless of edit-distance:
```
  - Digit substitution: 0→o, 1→l, 3→e  (e.g. "r3quests", "1odash")
  - Separator swap: hyphen↔underscore↔none  (e.g. "node_fetch" vs "node-fetch")
  - Homoglyph: Cyrillic/Greek lookalikes replacing ASCII chars
  - Suffix stuffing: "-js", "-node", "-lib", "-python" appended to known name
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

# pip
pip-audit --requirement requirements.txt

# cargo
cargo audit

# All ecosystems — OSV scanner (preferred — covers npm, pip, cargo, Go)
osv-scanner --lockfile <lockfile>
```

### OSV.dev API — direct CVE check (no tool install required)

```bash
# Query OSV.dev for a specific package version before installing
check_osv() {
  local ecosystem="$1"   # "npm" | "PyPI" | "crates.io"
  local pkg="$2"
  local ver="$3"
  curl -s "https://api.osv.dev/v1/query" \
    -H "Content-Type: application/json" \
    -d "{\"version\":\"${ver}\",\"package\":{\"name\":\"${pkg}\",\"ecosystem\":\"${ecosystem}\"}}" \
    | grep -q '"id"' && echo "VULN FOUND — block install" || echo "clean"
}

# Usage
check_osv "PyPI"       "requests"  "2.26.0"
check_osv "npm"        "lodash"    "4.17.20"
check_osv "crates.io"  "rand"      "0.7.3"
```

Known-malicious package fast-reject list (supplement to OSV):
```
PyPI:  colourama, djanga, python-dateutil2, reqeusts, urllib4, setup-tools
npm:   event-stream@3.3.6, flatmap-stream, cross-env2, d3.js, jquery.js
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
[yana-ai/44-supply-chain-vetting] BLOCKED — supply chain gate not passed
  Package  : <name>@<version>
  Reason   : <typosquatting | unpinned | script injection | audit fail | too new>
  Action   : Install blocked. Human must approve after reviewing vetting report.
  Log      : core/memory/audit/agent-actions.log
```

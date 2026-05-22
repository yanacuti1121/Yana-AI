# YAMTAM ENGINE — Dependency Vetting Law
# Source: ossf/scorecard vetting criteria (Apache 2.0) — github.com/ossf/scorecard
# Gate: Action Gate L4 (supply chain)

**Status:** Active  
**Tier:** TIER 1 — SECURITY  
**Scope:** All package installation commands in all sessions

---

## Core Rule

Agents MUST NOT execute any package install command without passing the vetting gate.
Typosquatting attacks and malicious packages are the primary threat model.

**Commands requiring vetting (all package managers):**

```
npm install <pkg>    yarn add <pkg>     pnpm add <pkg>
pip install <pkg>    pip3 install <pkg>
cargo add <pkg>      cargo install <pkg>
gem install <pkg>    go get <pkg>
apt-get install <pkg>  brew install <pkg>
```

Installing from package.json / requirements.txt (bulk restore) is EXEMPT —
those packages were already vetted when first added.

---

## Vetting Criteria (ossf/scorecard-inspired)

A package PASSES the gate if it meets **≥ 4 of 8** criteria:

```
□ Maintained       — commits or releases in last 90 days
□ High downloads   — npm > 100K/week  |  PyPI > 10K/month  |  crates.io > 1K/month
□ Pinned versions  — package uses exact versions, not floating ^ / * / ~
□ Code review      — PRs merged via review, not direct push to main
□ Signed releases  — releases have GPG/Sigstore signatures
□ Security policy  — has SECURITY.md or security advisories process
□ No known CVEs    — no unpatched critical/high CVEs in target version
□ Whitelisted      — in core/config/package-whitelist.json
```

Scorecard checks mapped: Maintained, Dependency-Update-Tool, Pinned-Dependencies,
Code-Review, Signed-Releases, Security-Policy, Vulnerabilities.

---

## Action Gate L4 — Install Blocker

When agent wants to install a new package:

```
Step 1 — PAUSE: do not execute the install command
Step 2 — EVIDENCE: list which of the 8 criteria the package satisfies with evidence
Step 3 — REPORT: present to user in this format:
          Package: <name>@<version>
          Criteria met: X/8
          Evidence: [list]
          Recommendation: APPROVE / REJECT / NEEDS_REVIEW
Step 4 — HUMAN GATE: user must explicitly confirm or set YAMTAM_SCOPE_OK=1
Step 5 — LOG: secure-logger.sh supply_chain_gate "install <pkg>@<ver> — X/8 criteria"
Step 6 — EXECUTE: only after steps 1–5 complete
```

---

## Typosquat Detection

Before any install, check package name against common squatting patterns:

```
❌ Characters swapped:  reqeusts vs requests, expresss vs express
❌ Prefix/suffix added: python-requests, requests-http, node-lodash
❌ Homoglyphs:          rеquests (Cyrillic е vs Latin e)
❌ Separator change:    node_fetch vs node-fetch
❌ Missing hyphen:      react dom vs react-dom
```

If name resembles a top-1000 package but is NOT that exact package → automatic REJECT.

---

## Whitelist

Approved packages: `core/config/package-whitelist.json`

Adding to whitelist requires:
1. ossf/scorecard score ≥ 6.0 (run: `scorecard --repo=<org/name>`)
2. PR with evidence attached
3. No open critical CVEs

---

## Violation Response

```
[yamtam/dependency-vetting] BLOCKED — unvetted package install
  Package  : <name>@<version>
  Command  : <full command>
  Criteria : <X>/8 met
  Gate     : L4
  Fix      : Provide vetting evidence, or add to package-whitelist.json via PR
```

Exit code: **4** (distinct from other gates)

---
name: supply-chain-security
description: >
  Secure the software supply chain — SBOM generation, dependency provenance
  verification, package integrity (Sigstore/npm provenance), lockfile auditing,
  typosquatting detection, CI artifact signing, and dependency update policy.
  Use when asked about "SBOM", "software bill of materials", "supply chain
  attack", "dependency provenance", "Sigstore", "npm provenance", "package
  integrity", "typosquatting", "dependency confusion", "artifact signing",
  "SLSA", "slsa framework", "lockfile security", or "third-party package risk".
  Do NOT use for: secret scanning in code — see secret-management.
  Do NOT use for: runtime vulnerability scanning — see security-pipeline.
origin: adapted:MIT © VoltAgent/awesome-agent-skills (Trail of Bits supply chain module)
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "npm/pnpm/yarn, Python pip. GitHub Actions. Syft for SBOM."
---

## When to Use

- Use when: preparing a compliance report or audit requiring SBOM
- Use when: a dependency was flagged in a CVE after a recent update
- Use when: setting up a new service and locking down its dependency policy
- Use when: responding to a supply chain incident (e.g., compromised npm package)
- Do NOT use for: SAST / code vulnerability scanning — see security-pipeline
- Do NOT use for: secrets in CI — see secret-management

---

## SBOM Generation

```bash
# Syft — generates SBOM in multiple formats
# Install: brew install syft  or  docker pull anchore/syft

# From source directory
syft dir:. -o spdx-json > sbom.spdx.json
syft dir:. -o cyclonedx-json > sbom.cyclonedx.json

# From container image
syft myrepo/api:latest -o spdx-json > image-sbom.spdx.json

# Attach SBOM to GitHub release
gh release upload v1.2.3 sbom.spdx.json
```

```yaml
# CI — generate and attest SBOM on every release
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    artifact-name: sbom.spdx.json
    output-file: sbom.spdx.json

- name: Attest SBOM (Sigstore)
  uses: actions/attest-sbom@v1
  with:
    subject-path: dist/
    sbom-path: sbom.spdx.json
```

---

## Dependency Provenance (npm)

```bash
# Check npm provenance — verifies package was built from declared source
npm install --dry-run 2>&1
npm audit signatures         # verify signatures on all installed packages

# View provenance for a specific package
npm view react dist-tags
npm view react@18.3.0 _id dist.integrity dist.signatures
```

```json
// package.json — enable provenance-required policy (npm v9.5+)
{
  "scripts": {
    "install:verified": "npm ci --audit-level=high"
  }
}
```

---

## Lockfile Integrity

```bash
# Never skip lockfile — reproducible installs
npm ci         # uses package-lock.json exactly — errors if drift
pnpm install --frozen-lockfile  # same for pnpm

# ❌ npm install in CI — can update lockfile silently
# ✅ npm ci in CI — fails if lockfile is out of date

# Detect lockfile tampering (before install in sensitive environments)
git diff HEAD package-lock.json   # check if lockfile changed unexpectedly
```

---

## Typosquatting Detection

```bash
# Common attack patterns:
# lodash   → 1odash (digit not letter)
# moment   → momment (double letter)
# express  → expres (missing letter)
# axios    → axio (missing trailing s)

# Check for suspicious similar names
pip install safety   # Python equivalent CVE + name check
npx package-name-check axios  # checks for known typosquats

# Verify publisher before adding new packages
npm info <package> | grep -E "maintainers|author|homepage"
# Expect: well-known maintainer, GitHub link, published date makes sense
```

---

## Dependency Confusion Attack Prevention

```
Attack: attacker publishes a public package with same name as your
        internal private package — CI picks up the public version.

Fix: scope all internal packages (@myorg/utils, not just utils)
     Pin private registry in .npmrc:
```

```bash
# .npmrc — force internal packages to private registry
@myorg:registry=https://npm.myorg.com
//npm.myorg.com/:_authToken=${NPM_PRIVATE_TOKEN}

# For all other packages, use public registry
registry=https://registry.npmjs.org
```

---

## Artifact Signing (SLSA Level 2+)

```yaml
# GitHub Actions — sign release artifacts with Sigstore cosign
- name: Sign artifact
  uses: sigstore/cosign-action@v3
  with:
    sign: ./dist/myapp-linux-amd64

# Verify signature before deployment
- name: Verify artifact
  run: |
    cosign verify-blob \
      --certificate-identity-regexp "https://github.com/myorg/myrepo/.github/workflows/release.yml" \
      --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
      --bundle dist/myapp-linux-amd64.bundle \
      dist/myapp-linux-amd64
```

---

## Dependency Update Policy

```yaml
# .github/dependabot.yml — automated PRs for updates
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    groups:
      dev-deps:
        patterns: ["eslint*", "typescript", "vitest"]
    ignore:
      - dependency-name: "some-frozen-dep"
        versions: [">= 3.0.0"]    # breaking change, intentionally pinned
    open-pull-requests-limit: 10
```

---

## Anti-Fake-Pass Rules

Before claiming supply chain security is in place, you MUST show:
- [ ] SBOM generated and attached to every release artifact
- [ ] `npm ci` / `pnpm install --frozen-lockfile` used in CI — not `npm install`
- [ ] Internal packages scoped (`@myorg/`) — dependency confusion prevented
- [ ] `npm audit` / `pip-audit` runs in CI with `--audit-level=high` exit code
- [ ] New dependencies verified: publisher identity, repo link, published date checked
- [ ] Dependabot or Renovate configured — no manual-only dependency updates

Reference: `gates/anti-fake-pass-gate.md`

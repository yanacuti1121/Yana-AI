**Rule:** slsa-artifact-law
**Status:** REVIEWED
**Gate:** L4 — artifact publish and dependency install
**Source:** slsa-framework/slsa (SLSA v1.0), sigstore/cosign, in-toto/in-toto, sigstore/sigstore, google/ko

---

# SLSA Artifact Provenance Law

## Principle

Every artifact consumed or produced by YAMTAM-governed agents must have
verifiable provenance. "It came from the internet" is not provenance.

## SLSA Levels (minimum enforcement)

```
SLSA 0  No provenance                    → BLOCKED for production deps
SLSA 1  Provenance exists (unsigned)     → Allowed for dev/internal tools
SLSA 2  Provenance signed by build svc  → Required for released artifacts
SLSA 3  Build env hardened + isolated   → Required for agent tool binaries

Rule: any dep tagged SLSA 0 that touches agent tools → blocks at Gate L4
```

## Artifact verification (cosign)

```bash
# Verify container image signature before pull
cosign verify \
  --certificate-identity "https://github.com/owner/repo/.github/workflows/release.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  ghcr.io/owner/image:tag

# Verify npm package provenance (npm 9.5+)
npm audit signatures          # checks all installed packages
npm install --foreground-scripts package@version  # with provenance check

# Verify Python package (pip-audit + sigstore)
pip-audit --require-hashes -r requirements.txt
python -m sigstore verify package-name==1.0.0
```

## Build provenance attestation

```yaml
# GitHub Actions: generate SLSA provenance with slsa-github-generator
jobs:
  build:
    uses: slsa-framework/slsa-github-generator/.github/workflows/builder_go_slsa3.yml@v1.9.0
    with:
      go-version: '1.21'
    secrets: inherit
# Produces: .intoto.jsonl attestation alongside artifact
```

## in-toto supply chain steps

```python
# in-toto: declare expected build steps
from in_toto import runlib

# Step 1: record what source was used
link = runlib.in_toto_run(
    name="build",
    material_list=["src/"],
    product_list=["dist/app"],
    link_cmd_args=["make", "build"],
)
link.dump("build.link")

# Verify: chain of custody from source → dist must be unbroken
# Any step skipped or material tampered = reject artifact
```

## Minimum provenance fields (YAMTAM artifact manifest)

```json
{
  "artifact": "yamtam-engine-v1.3.39.zip",
  "sha256": "<hash>",
  "builder":  { "id": "https://github.com/actions/runner" },
  "source":   { "uri": "git+https://github.com/phamlongh230-lgtm/yamtam-engine@refs/tags/v1.3.39" },
  "build_type": "https://slsa.dev/provenance/v1",
  "slsa_level": 2
}
```

## Anti-Pattern Checklist

```
❌ Pulling container image without cosign signature verify
❌ Installing npm/pip package without provenance check (npm audit signatures)
❌ Releasing artifact without sha256 in release manifest
❌ Agent tool binary downloaded from URL without SLSA level check
❌ Build pipeline that allows input from untrusted PR (SLSA 0)
❌ Skipping in-toto step verification when deploying to production
```

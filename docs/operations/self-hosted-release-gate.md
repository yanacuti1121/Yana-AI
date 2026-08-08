# Self-Hosted Release Gate

`core/scripts/release-gate.py` is the authoritative verification entry point
for a Yana AI release candidate. It runs entirely on the host that invokes it:
it does not call GitHub, upload artifacts, publish a package, or deploy
anything.

GitHub Actions remains useful as an external review signal. It is not a
release authority: a release is eligible only when the self-hosted gate report
for the exact commit is `"result": "passed"`.

The default gate mirrors the repository's checked-in release and CI contract:
metadata and generated-file drift, integrity locks, adapter parity, Python
regressions, Rust build/unit/integration tests, scanner self-audit, hook tests,
the five-run cross-language flock matrix (including external-cwd execution),
and packaging surfaces. It checks the working tree both before and after the
suite, verifies that `HEAD` did not change, and bounds each check to 30 minutes
so a mutating or hung test cannot produce release evidence.

## Runner contract

For the full Ubuntu/macOS operator sequence, see
`docs/operations/self-hosted-release-runbook.md`.

The host needs a checked-out, clean copy of the candidate commit plus Python
3.11+, Node.js/npm, Rust/Cargo, Bash, Git, and the tools required by the
existing test suites.

Run the complete gate from a dedicated checkout:

```bash
git fetch origin
git switch --detach <candidate-commit>
python3 core/scripts/release-gate.py \
  --output /var/lib/yana-ai/release-gate/<candidate-commit>
```

For an operational runner, use the checked-in wrapper instead. It rejects a
moving branch, a dirty checkout, and artifact storage inside the candidate
checkout; it creates a unique evidence path and invokes the gate without any
diagnostic flags:

```bash
bash core/scripts/run-self-hosted-release-gate.sh \
  --checkout /srv/yana-ai-candidate \
  --artifact-root /var/lib/yana-ai/release-gate
```

Portable manual-trigger templates for systemd and launchd are in
`ops/release-gate/`. They intentionally do not fetch or switch a candidate;
an operator must prepare a clean detached worktree for the reviewed commit
before every release-gate run.

Before enabling a runner or after changing its toolchain, run its preflight:

```bash
python3 core/scripts/check-self-hosted-runner.py \
  --checkout /srv/yana-ai-candidate \
  --artifact-root /var/lib/yana-ai/release-gate
```

It checks the supported platform, required toolchain, Python 3.11+, `pytest`,
artifact-root writability, and the immutable-checkout contract. It never
installs dependencies or changes the candidate checkout. Use `--json` for a
machine-readable report.

Prepare that detached checkout from a local Git mirror, not a moving remote:

```bash
bash core/scripts/prepare-self-hosted-release-candidate.sh \
  --source-repo /srv/yana-ai-mirror \
  --revision <full-commit> \
  --checkout /srv/yana-ai-candidate
```

The preparer accepts only a local repository and a full commit ID. It creates
a self-contained clone in a staging directory, verifies the exact detached and
clean commit, then moves it into a previously unused checkout path. It never
fetches from the network or overwrites an existing candidate.

The gate writes `report.json`, `report.sha256`, `checksums.sha256`, plus a
stdout/stderr log for every check. It writes SHA-256 and byte size for
`target/release/yana-rt` only after the release build check succeeds, plus each
file provided with `--artifact`. Copy this directory to controlled artifact storage
after a successful run; the runner intentionally has no network or storage
credentials built in.

For a local diagnostic only, `--allow-dirty` records the dirty state but does
not reject it. Selecting or skipping individual checks is also diagnostic.
These reports set `"mode": "diagnostic"` and `"release_eligible": false` even
when every selected check passes.

```bash
npm run verify:release
python3 core/scripts/release-gate.py --list-checks
python3 core/scripts/release-gate.py --check rust-build --check rust-integration
```

## Decision rule

Promote only when all of these are true:

1. `report.json` has `schema: "yana-release-gate/v1"`, `result: "passed"`,
   `mode: "release"`, and `release_eligible: true`.
2. Its `repository.git_revision` equals the commit being promoted.
3. The report came from an approved macOS or Ubuntu runner.
4. Every checksum is copied with its artifact and verified again before use.

The gate has no deploy command. Publishing, desktop signing, GitHub release
creation, and rollback remain separate human-approved operations.

## Offline evidence verification

Before promotion, build one portable bundle that contains the verified report,
check logs, and artifacts at their report-relative paths:

```bash
python3 core/scripts/bundle-release-evidence.py \
  --evidence-dir /var/lib/yana-ai/release-gate/<commit>/<run> \
  --source-root /srv/yana-ai-candidate \
  --output /var/lib/yana-ai/release-bundles/<commit>-<run>
```

Then verify the copied bytes from the bundle itself:

```bash
python3 core/scripts/verify-release-evidence.py \
  /var/lib/yana-ai/release-bundles/<commit>-<run> \
  --expected-revision <full-commit> \
  --artifact-root /var/lib/yana-ai/release-bundles/<commit>-<run>/artifacts
```

The bundler and verifier fail closed for diagnostic reports, revision drift,
altered reports or logs, checksum-manifest mismatches, modified artifacts,
unsafe paths, existing output paths, and missing files. They do not publish or
deploy anything.

Checksums prove bundle integrity, not runner identity. Treat evidence as
promotion-authoritative only after it has entered access-controlled storage
from an approved runner. Cryptographic runner attestation remains a separate
hardening layer.

## Vault Transit attestation

For an approved production promotion path, attest the already verified bundle
through a dedicated local Vault Agent API Proxy backed by a HashiCorp Vault
Transit `ecdsa-p256` key. The runner sends only report-derived digests over the
agent's protected Unix socket. It must never read a Vault token, private key,
or token file; Vault Agent keeps its Auto-Auth token in memory and forces that
identity on the Transit sign and verify requests.

```bash
python3 core/scripts/attest-release-evidence.py sign \
  /var/lib/yana-ai/release-bundles/<commit>-<run> \
  --expected-revision <full-commit> \
  --artifact-root /var/lib/yana-ai/release-bundles/<commit>-<run>/artifacts \
  --vault-transit-key yana-release-evidence \
  --vault-agent-socket /run/yana-release-signer/vault-proxy.sock

python3 core/scripts/attest-release-evidence.py verify \
  /var/lib/yana-ai/release-bundles/<commit>-<run> \
  --expected-revision <full-commit> \
  --artifact-root /var/lib/yana-ai/release-bundles/<commit>-<run>/artifacts \
  --vault-transit-key yana-release-evidence \
  --vault-agent-socket /run/yana-release-signer/vault-proxy.sock
```

The client calls only `POST /v1/transit/sign/<key>/sha2-256` and
`POST /v1/transit/verify/<key>/sha2-256` through that socket. Reject a missing
or unsafe socket, missing attestation, malformed Transit response, changed
bundle bytes, key mismatch, or `valid: false`. The AppRole delivery, socket
ownership, Vault policy, and TLS connection from Agent to Vault are
operator-managed deployment configuration, not repository secrets. Use the
dedicated templates in `ops/release-signer/`; do not promote a bundle until both
the evidence verifier and this attestation verifier pass.

Before the release gate, run the separate `core/scripts/check-release-signer.py`
preflight against the same socket and key. It signs and verifies a fixed
non-release payload to prove the local Agent, AppRole policy, and Transit path
are usable without emitting credentials or release artifacts.

## Independent runners

Use at least one maintained Ubuntu runner and one macOS runner. Both execute
the same checked-in command and store reports independently. A GitHub outage
therefore cannot prevent validation or create a false release approval.

### systemd and launchd templates

`ops/release-gate/systemd/yana-release-gate.service` and
`ops/release-gate/launchd/com.yana.release-gate.plist` are hardened,
manual-trigger templates for Ubuntu and macOS. Copy and review the companion
instructions in `ops/release-gate/README.md` before installing either one.
Both templates call `run-self-hosted-release-gate.sh`, rather than the Python
gate directly, so the detached-head, clean-worktree, and outside-artifact-root
checks cannot be skipped accidentally.

Use a separate approval process to prepare the immutable checkout and copy
each uniquely named report directory to durable storage. Do not run a moving
`main` branch checkout as a release candidate.

## Failure and rollback

A non-zero exit means no promotion. Preserve the report directory and logs,
repair the candidate in a new commit, then run the gate again for that exact
commit. Artifact rollback selects a previously approved report/artifact pair;
it never reuses an artifact with a mismatched checksum.

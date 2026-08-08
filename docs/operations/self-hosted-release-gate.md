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

Before promotion, copy artifacts into a controlled directory using the same
relative paths recorded in `report.json`, then verify the complete bundle:

```bash
python3 core/scripts/verify-release-evidence.py \
  /var/lib/yana-ai/release-gate/<commit>/<run> \
  --expected-revision <full-commit> \
  --artifact-root /var/lib/yana-ai/release-artifacts/<commit>
```

The verifier fails closed for diagnostic reports, revision drift, altered
reports or logs, checksum-manifest mismatches, modified artifacts, unsafe
paths, and missing files. It does not publish or deploy anything.

Checksums prove bundle integrity, not runner identity. Treat evidence as
promotion-authoritative only after it has entered access-controlled storage
from an approved runner. Cryptographic runner attestation remains a separate
hardening layer.

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

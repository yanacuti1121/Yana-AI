# Self-Hosted Release Gate

`core/scripts/release-gate.py` is the authoritative verification entry point
for a Yana AI release candidate. It runs entirely on the host that invokes it:
it does not call GitHub, upload artifacts, publish a package, or deploy
anything.

GitHub Actions remains useful as an external review signal. It is not a
release authority: a release is eligible only when the self-hosted gate report
for the exact commit is `"result": "passed"`.

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

## Independent runners

Use at least one maintained Ubuntu runner and one macOS runner. Both execute
the same checked-in command and store reports independently. A GitHub outage
therefore cannot prevent validation or create a false release approval.

### systemd example (Ubuntu)

Install this on the self-hosted runner after replacing paths and the commit
selection mechanism for that host:

```ini
# /etc/systemd/system/yana-release-gate.service
[Service]
Type=oneshot
User=yana
WorkingDirectory=/srv/yana-ai
ExecStart=/usr/bin/python3 core/scripts/release-gate.py
```

Use a separate scheduler or manual approval process to prepare the immutable
checkout and copy each uniquely named report directory to durable storage. Do
not run a moving `main` branch checkout as a release candidate.

### launchd example (macOS)

Use the same command in a manually-reviewed LaunchDaemon or LaunchAgent with
an explicit `WorkingDirectory` and output path. The job must run from a
dedicated checkout, never from a developer's active worktree.

## Failure and rollback

A non-zero exit means no promotion. Preserve the report directory and logs,
repair the candidate in a new commit, then run the gate again for that exact
commit. Artifact rollback selects a previously approved report/artifact pair;
it never reuses an artifact with a mismatched checksum.

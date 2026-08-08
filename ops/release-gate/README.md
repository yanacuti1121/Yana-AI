# Self-Hosted Runner Assets

These templates run the checked-in release gate without GitHub Actions. They
do not fetch a candidate, upload evidence, publish a package, or deploy.
Prepare a fresh candidate checkout at the exact commit first, then detach it:

```bash
git -C /srv/yana-ai-candidate switch --detach <candidate-commit>
git -C /srv/yana-ai-candidate status --porcelain
```

The wrapper rejects a branch checkout and any dirty worktree. It writes each
run below `<artifact-root>/<full-commit>/<utc-timestamp>-<pid>/`; the gate owns
the final output directory and records checksums there.

## Installation

1. Create a dedicated unprivileged `yana` account, an isolated checkout, and
   an artifact directory owned by that account.
2. Copy `release-gate.env.example` to `/etc/yana-release-gate.env` (or another
   protected location) and choose the host Python interpreter.
3. Replace `/srv/yana-ai-candidate`, the platform-specific artifact path, and
   the log paths in the template with paths owned by the runner account.
4. Install one template on each independent runner:
   - Ubuntu: copy `systemd/yana-release-gate.service` to
     `/etc/systemd/system/`, run `systemctl daemon-reload`, then start it only
     after manually preparing a detached candidate.
   - macOS: copy `launchd/com.yana.release-gate.plist` to the appropriate
     LaunchDaemon or LaunchAgent location and load it only after manually
     preparing a detached candidate.

The templates are intentionally manual-triggered. A scheduler must never turn
a moving `main` checkout into release evidence. If a host scheduler is later
used, it must prepare a new clean detached worktree for a reviewed commit
before invoking this wrapper.

Run the preflight before first use and after every toolchain change:

```bash
python3 core/scripts/check-self-hosted-runner.py \
  --checkout /srv/yana-ai-candidate \
  --artifact-root /var/lib/yana-ai/release-gate
```

Prepare the candidate from a local mirror before each reviewed release:

```bash
bash core/scripts/prepare-self-hosted-release-candidate.sh \
  --source-repo /srv/yana-ai-mirror \
  --revision <full-commit> \
  --checkout /srv/yana-ai-candidate
```

The checkout path must not exist yet. Retain any staging directory reported on
failure for investigation rather than deleting it automatically.

## Artifact retention

Build a portable bundle before applying retention or promotion:

```bash
python3 core/scripts/bundle-release-evidence.py \
  --evidence-dir /var/lib/yana-ai/release-gate/<commit>/<run> \
  --source-root /srv/yana-ai-candidate \
  --output /var/lib/yana-ai/release-bundles/<commit>-<run>
```

Retention policy must keep the bundle's `report.json`, `report.sha256`,
`checksums.sha256`, every check log, and all artifacts as one immutable unit.
Do not delete a bundle while it is being written; this repository intentionally
provides no automatic pruning command.

Run `core/scripts/verify-release-evidence.py` against the stored evidence and
artifact roots before any human-approved promotion. A PASS proves the stored
bytes still match the eligible report for the expected commit; it does not
authenticate which runner produced those bytes.

For production promotion, configure the dedicated Vault Agent API Proxy in
`ops/release-signer/`, backed by HashiCorp Vault Transit, and use
`core/scripts/attest-release-evidence.py` to sign then verify the bundle. The
runner must never receive the Vault token or private key; see
`docs/operations/self-hosted-release-gate.md` for the exact commands.

See `docs/operations/self-hosted-release-gate.md` for the release decision
rule and required checks.

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

## Artifact retention

Copy every report directory to controlled storage before applying host-level
retention. Retention policy must keep `report.json`, `report.sha256`,
`checksums.sha256`, every check log, and all explicitly approved artifacts as
one immutable unit. Do not delete an artifact directory while it is being
written; this repository intentionally provides no automatic pruning command.

Run `core/scripts/verify-release-evidence.py` against the stored evidence and
artifact roots before any human-approved promotion. A PASS proves the stored
bytes still match the eligible report for the expected commit; it does not
authenticate which runner produced those bytes.

See `docs/operations/self-hosted-release-gate.md` for the release decision
rule and required checks.

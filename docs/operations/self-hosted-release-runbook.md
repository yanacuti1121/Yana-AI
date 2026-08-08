# Self-Hosted Release Runbook

This runbook verifies one reviewed Yana AI commit without GitHub Actions. It
does not publish, deploy, or approve a promotion. Promotion is a separate,
human-approved operation.

## 1. Prepare independent runners

Maintain one Ubuntu runner and one macOS runner. Each needs an unprivileged
`yana` account, a local Git mirror, and an artifact root outside its candidate
checkout. The runner preflight requires Bash, Git, Node, npm, Cargo, Rust,
Python 3.11+, and pytest. GitHub may refresh a mirror before a release window,
but none of the verification commands below contact GitHub.

Example paths:

```text
/srv/yana-ai-mirror
/srv/yana-ai-candidate
/var/lib/yana-ai/release-gate
/var/lib/yana-ai/release-bundles
```

## 2. Configure the Ubuntu signer

Install the Vault Agent templates in `ops/release-signer/`. The Vault operator
creates a dedicated AppRole policy that permits only:

- `transit/sign/yana-release-evidence/sha2-256`
- `transit/verify/yana-release-evidence/sha2-256`

Deliver a response-wrapped SecretID through approved secret management. Never
place a Vault token, SecretID, or private key in the repository, shell history,
environment file, or command line. After the Agent starts, prove its protected
socket and policy before a release:

```bash
python3 core/scripts/check-release-signer.py \
  --vault-agent-socket /run/yana-release-signer/vault-proxy.sock \
  --vault-transit-key yana-release-evidence
```

On macOS, run the verification path independently. Configure a Vault Agent only
when that host is separately authorized to attest.

## 3. Prepare an immutable candidate

Use a full reviewed commit ID from the local mirror. The checkout destination
must not exist already:

```bash
REVISION=<full-40-or-64-character-commit>
bash core/scripts/prepare-self-hosted-release-candidate.sh \
  --source-repo /srv/yana-ai-mirror \
  --revision "$REVISION" \
  --checkout /srv/yana-ai-candidate
```

The command creates a detached, clean candidate from the local mirror. On any
failure, retain the reported staging directory for investigation.

## 4. Run preflight and the release gate

Run these from the candidate checkout on both independent runners:

```bash
python3 core/scripts/check-self-hosted-runner.py \
  --checkout /srv/yana-ai-candidate \
  --artifact-root /var/lib/yana-ai/release-gate

bash core/scripts/run-self-hosted-release-gate.sh \
  --checkout /srv/yana-ai-candidate \
  --artifact-root /var/lib/yana-ai/release-gate
```

A non-zero exit, changed `HEAD`, dirty candidate, missing tool, or failed check
is a hard stop. Repair in a new reviewed commit and begin with a fresh candidate.

## 5. Build and verify portable evidence

Use the report directory printed by the gate. Store its bundle outside the
candidate checkout:

```bash
RUN=<utc-timestamp-pid>
python3 core/scripts/bundle-release-evidence.py \
  --evidence-dir "/var/lib/yana-ai/release-gate/$REVISION/$RUN" \
  --source-root /srv/yana-ai-candidate \
  --output "/var/lib/yana-ai/release-bundles/$REVISION-$RUN"

python3 core/scripts/verify-release-evidence.py \
  "/var/lib/yana-ai/release-bundles/$REVISION-$RUN" \
  --expected-revision "$REVISION" \
  --artifact-root "/var/lib/yana-ai/release-bundles/$REVISION-$RUN/artifacts"
```

The bundle and verifier fail closed on altered reports, logs, artifacts,
checksums, paths, revisions, or ineligible diagnostics.

## 6. Attest and approve promotion

On the authorized signer runner, attest the verified bundle through the Vault
Agent socket:

```bash
BUNDLE="/var/lib/yana-ai/release-bundles/$REVISION-$RUN"
python3 core/scripts/attest-release-evidence.py sign "$BUNDLE" \
  --expected-revision "$REVISION" \
  --artifact-root "$BUNDLE/artifacts" \
  --vault-transit-key yana-release-evidence \
  --vault-agent-socket /run/yana-release-signer/vault-proxy.sock

python3 core/scripts/attest-release-evidence.py verify "$BUNDLE" \
  --expected-revision "$REVISION" \
  --artifact-root "$BUNDLE/artifacts" \
  --vault-transit-key yana-release-evidence \
  --vault-agent-socket /run/yana-release-signer/vault-proxy.sock
```

Two operators review the independent reports, exact revision, bundle checksums,
and Transit attestation before a separately authorized promotion. If any check
fails, preserve evidence and stop. Rollback selects a previously approved
bundle/artifact pair; never reuse an artifact with a mismatched checksum.

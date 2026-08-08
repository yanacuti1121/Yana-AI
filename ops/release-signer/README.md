# Vault Transit Release Signer

This is a deployment template for a dedicated Vault Agent API Proxy used by the
self-hosted Yana AI release runner. The proxy authenticates to Vault with an
operator-provisioned AppRole and forces its in-memory auto-auth token onto the
local Unix-socket requests. The runner calls the socket; it never reads a Vault
token, SecretID, token sink, or private key.

## Operator setup

1. Create one `yana-release-signer` AppRole with a policy that permits only:
   - `update` on `transit/sign/yana-release-evidence/sha2-256`;
   - `update` on `transit/verify/yana-release-evidence/sha2-256`.
   Do not grant key creation, export, encryption, decryption, rotation, or
   unrelated Transit paths.
2. Copy `vault-agent.hcl.example` to `/etc/yana-release-signer/vault-agent.hcl`
   and replace only the Vault address and approved key/role path names.
3. Deliver the RoleID through protected configuration management. Deliver a
   response-wrapped SecretID with a short TTL to
   `/run/yana-release-signer/secret-id-wrapped`; do not put either value in this
   repository, a command line, environment variable, log, or systemd unit.
4. Install `systemd/yana-release-signer-vault-agent.service`, then verify that
   `/run/yana-release-signer/vault-proxy.sock` is owned by the dedicated `yana`
   account and not accessible to other users.
5. Run the release evidence commands with:

   ```bash
   --vault-agent-socket /run/yana-release-signer/vault-proxy.sock
   --vault-transit-key yana-release-evidence
   ```

Before creating a release bundle, prove that the local Agent socket and the
restricted Transit policy can sign and verify one fixed preflight payload:

```bash
python3 core/scripts/check-release-signer.py \
  --vault-agent-socket /run/yana-release-signer/vault-proxy.sock \
  --vault-transit-key yana-release-evidence
```

This command does not emit a token, SecretID, signature, or evidence artifact.
It fails closed if the socket, AppRole authentication, Transit policy, key, or
verification path is unavailable.

Vault Agent removes the SecretID file after reading it. The proxy retains the
renewable Vault token only in memory and ignores any caller-supplied token due
to `use_auto_auth_token = "force"`.

## Rotation and failure

Rotate the AppRole SecretID through the approved secret-delivery path before
its TTL expires. If Vault Agent, the Unix socket, or Transit is unavailable,
attestation fails closed and promotion must stop. Restarting the agent removes
its in-memory token; a new wrapped SecretID delivery is required before it can
authenticate again.

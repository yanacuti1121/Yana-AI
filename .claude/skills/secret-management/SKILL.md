---
name: secret-management
description: >
  Store, access, rotate, and audit secrets safely — provider selection
  (Vault, AWS Secrets Manager, GCP Secret Manager), runtime injection,
  rotation policy, least-privilege IAM, CI/CD secret handling, and
  secret scanning in pipelines. Use when asked to "store API keys",
  "rotate secrets", "Vault", "AWS Secrets Manager", "secret rotation",
  "least privilege", "secrets in CI", "secret scanning", "gitleaks",
  "trufflehog", "don't hardcode credentials", or "how to manage secrets
  in production". Do NOT use for: general auth token lifecycle —
  see auth-patterns. Do NOT use for: environment variable naming
  conventions alone — this covers secret storage architecture.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "AWS Secrets Manager, HashiCorp Vault ≥ 1.14, GitHub Actions. Patterns are provider-agnostic."
---

## When to Use

- Use when: API keys, DB passwords, or tokens need to be stored for production
- Use when: secrets are rotating and services need to pick up new values without restart
- Use when: setting up a new service's secret access in CI/CD
- Use when: auditing where secrets live before a compliance review
- Do NOT use for: managing JWTs at request time — that's auth-patterns
- Do NOT use for: encrypting user data at rest — that's a data-privacy concern

---

## Where NOT to Store Secrets

```
❌ Hardcoded in source code      — committed to git, permanent history
❌ .env files committed to repo  — leaked in every clone
❌ Config files in repo          — even if gitignored, easy to accidentally commit
❌ Container image layers        — docker history exposes them
❌ CI/CD logs                    — secrets printed in output are captured forever
❌ URL query parameters          — logged by every proxy and browser
❌ Client-side code / browser    — visible to any user
```

**If a secret is committed to git, treat it as compromised** — rotate it immediately, then purge history.

---

## Provider Selection

| Provider | Use when | Rotation | Audit log |
|---|---|---|---|
| **AWS Secrets Manager** | AWS-native stack | Native (Lambda trigger) | CloudTrail |
| **HashiCorp Vault** | Multi-cloud, self-hosted control | Built-in dynamic secrets | Audit device |
| **GCP Secret Manager** | GCP-native stack | Manual + Cloud Functions | Cloud Audit Logs |
| **Azure Key Vault** | Azure-native stack | Native policy | Azure Monitor |
| **Doppler / Infisical** | Small team, SaaS simplicity | Manual + webhooks | Dashboard |

Use your cloud provider's native manager unless you need multi-cloud or dynamic secrets — operational overhead of self-hosted Vault is high.

---

## AWS Secrets Manager — Runtime Access

```python
import boto3, json
from functools import lru_cache

@lru_cache(maxsize=None)  # cache per process — re-fetch only on rotation
def get_secret(secret_name: str) -> dict:
    client = boto3.client('secretsmanager', region_name='us-east-1')
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])

# Usage — never log the return value
db_creds = get_secret('prod/myapp/database')
conn = psycopg2.connect(
    host=db_creds['host'],
    user=db_creds['username'],
    password=db_creds['password'],
)
```

For rotation-aware services: use AWS SDK retry on `SecretRotationInProgress` — the SDK handles it automatically if you call `get_secret_value` on each connection, not at startup.

---

## HashiCorp Vault — Dynamic Secrets

Dynamic secrets are generated per-request and auto-expire — the most secure pattern.

```bash
# Enable database engine
vault secrets enable database
vault write database/config/mydb \
  plugin_name=postgresql-database-plugin \
  connection_url="postgresql://{{username}}:{{password}}@db:5432/mydb" \
  allowed_roles="app-role" \
  username="vault-admin" password="$VAULT_DB_ADMIN_PASS"

# Define role — credentials live for 1 hour, then auto-revoked
vault write database/roles/app-role \
  db_name=mydb \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" max_ttl="24h"
```

```python
# App fetches fresh credentials on each startup / TTL renewal
import hvac
client = hvac.Client(url='https://vault.internal', token=os.environ['VAULT_TOKEN'])
creds = client.secrets.database.generate_credentials(name='app-role')
```

---

## Least-Privilege Access

```json
// AWS IAM policy — app can only read its own secrets, not list or delete
{
  "Effect": "Allow",
  "Action": ["secretsmanager:GetSecretValue"],
  "Resource": "arn:aws:secretsmanager:us-east-1:123456789:secret:prod/myapp/*"
}
// ❌ Never: "Resource": "*" or Action: "secretsmanager:*"
```

```hcl
# Vault policy — same principle
path "secret/data/prod/myapp/*" {
  capabilities = ["read"]     # read only — no create/update/delete/list
}
```

One IAM role / Vault policy per service. Never share credentials between services.

---

## CI/CD Secret Injection

```yaml
# GitHub Actions — secrets never appear in logs
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-deploy
          aws-region: us-east-1
      # Fetch secret at runtime, not as env var in yaml
      - name: Deploy
        run: |
          DB_PASS=$(aws secretsmanager get-secret-value \
            --secret-id prod/myapp/database --query SecretString --output text \
            | jq -r .password)
          # Use $DB_PASS inline — never echo it
```

Rules: use OIDC/IAM federation (no long-lived keys in GitHub Secrets), never `echo $SECRET`, mask with `::add-mask::$DB_PASS`.

---

## Secret Scanning in CI

```yaml
# .github/workflows/secret-scan.yml — block PRs that introduce secrets
- name: Scan for secrets (gitleaks)
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

# Local pre-commit hook
- repo: https://github.com/gitleaks/gitleaks
  rev: v8.18.0
  hooks:
    - id: gitleaks
```

Run on every PR and as a nightly full-history scan on the default branch.

---

## Rotation Policy

| Secret type | Interval | Method |
|---|---|---|
| DB passwords | 90 days | Vault dynamic / AWS rotation Lambda |
| API keys (3rd party) | 180 days | Manual + calendar alert |
| Service tokens | 24–72 hrs | Short TTL + auto-renew |
| TLS certs | Before expiry | ACM / Let's Encrypt auto-renew |

Rotation must be zero-downtime: write new → verify → revoke old.

---

## Anti-Fake-Pass Rules

Before claiming secret management work is done, you MUST show:
- [ ] No secrets in source code, `.env` files committed, or container layers
- [ ] Runtime fetch from secret store — not injected at build time into the image
- [ ] Least-privilege policy — service can only read its own secrets, not list/delete
- [ ] Rotation policy defined — interval documented, not "we'll do it later"
- [ ] Secret scanning running in CI (gitleaks or equivalent) on every PR
- [ ] CI uses OIDC / short-lived tokens — no long-lived keys stored in GitHub Secrets
- [ ] Secrets never logged — checked in error handlers and debug paths

Reference: `gates/anti-fake-pass-gate.md`

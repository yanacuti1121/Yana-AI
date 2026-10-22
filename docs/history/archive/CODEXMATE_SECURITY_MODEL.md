# Codexmate Security Model

> **Role split:**
> Codexmate = AI Coding Tools Control Panel (UI / provider / session / usage)
> Yana AI = Safety & Policy Engine (guards / audit / truth gate / rules)

---

## Deployment boundary

Codexmate is a **local/cloud-dev dashboard only**.

- Designed for: localhost, GitHub Codespaces, Google Cloud Shell Web Preview
- Not designed for: public internet, multi-user, production hosting
- Default bind: `127.0.0.1` — never expose on `0.0.0.0` without auth

If you run it on a shared machine or cloud environment, treat port access as equivalent to shell access.

---

## Secrets & tokens

**Never:**
- Store API keys plain text in repo files
- Display full token in UI (`sk-ant-abc...xyz` → show `sk-****xyz`)
- Log tokens to session history or export files
- Include secrets in config exports (`.json`, `.toml` backup files)

**Use instead:**
- `.env.local` (gitignored)
- GitHub Secrets → injected at runtime
- Cloud Shell environment variables (`export ANTHROPIC_API_KEY=...`)
- Masked display: `sk-****abcd` (last 4 chars only)

---

## Command execution

Any button or workflow that triggers shell commands must go through Yana AI gates:

| Blocked without explicit confirm |
|----------------------------------|
| `rm -rf` anything |
| Deploy / publish commands |
| `gh secret set` |
| `npm install` / `cargo build` when disk < 20% free |
| Any command touching `~/.ssh`, `~/.aws`, `/etc/` |

Commands route through `core/scripts/safe-run.sh` — the gate layer, not Codexmate itself.

---

## Usage numbers

The Usage panel shows **estimated** consumption based on session metadata.

- Estimated ≠ billing (provider bills differently based on caching, retries, batching)
- Do not use these numbers for financial reporting
- For accurate billing: read directly from provider dashboard
- Claude Code sessions may not record token counts for all model calls

---

## Scope — what Codexmate should stay

MVP surface — do not expand without reason:

1. Config (provider / model / Claude Code settings)
2. Sessions (history browser, export, search)
3. Usage (token heatmap, cost estimate, trends)
4. Skills (local skill management, import/export)
5. Orchestration (lightweight task queue)

**Not in scope:** marketplace integrations, plugin store, public sharing, auth management, CI/CD triggers.

---

## Yana AI integration points

Codexmate delegates all enforcement to Yana AI:

| Codexmate action | Yana AI gate |
|-----------------|-------------|
| Run command via Orchestration | `safe-run.sh` + `02-terminal-validator.md` |
| Export config file | `03-privilege-isolation.md` (YANA_SCOPE_OK check) |
| Install package via Docs panel | `44-supply-chain-vetting.md` |
| Any external HTTP fetch | `network-egress-law.md` (SSRF block) |
| Hook modification | `49-immutable-infrastructure-law.md` |

Codexmate is the **control panel**. Yana AI is the **safety engine**. Neither replaces the other.

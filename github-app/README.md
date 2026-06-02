# YAMTAM GitHub App

1-click YAMTAM safety setup for any GitHub repo.

## What it does

When installed on a repo, automatically opens a PR with:
- `CLAUDE.md` — core rules for Claude Code
- `.claude/settings.json` — PreToolUse / PostToolUse hooks
- `.claude/hooks/guard-destructive.sh` — blocks rm -rf, force-push, DROP TABLE
- `.claude/hooks/audit-log.sh` — logs all AI tool calls
- `.claude/rules/golden-principles.md` — 6 core coding principles

## Setup

### 1. Register GitHub App

Go to: github.com/settings/apps/new

```
Name:              YAMTAM ENGINE
Homepage URL:      https://github.com/phamlongh230-lgtm/yamtam-engine
Webhook URL:       https://yamtam-github-app.<your-subdomain>.workers.dev/webhook
Webhook secret:    <generate a random secret>

Permissions:
  Contents:        Read & Write   (to create files)
  Pull requests:   Read & Write   (to open PR)
  Metadata:        Read

Subscribe to events:
  ✓ Installation
  ✓ Installation repositories
```

After creating: note the **App ID** and generate + download a **Private Key**.

### 2. Deploy to Cloudflare Workers

```bash
cd github-app
npm install
npx wrangler login

# Set secrets
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put GITHUB_APP_PRIVATE_KEY   # paste base64-encoded PEM
npx wrangler secret put APP_ID                   # numeric App ID

npm run deploy
```

### 3. Encode private key

```bash
base64 -w 0 private-key.pem
# paste output when prompted for GITHUB_APP_PRIVATE_KEY
```

### 4. Update webhook URL

After deploy, Wrangler gives you the Worker URL.
Update it in your GitHub App settings.

## Local dev

```bash
npm run dev
# exposes localhost:8787
# use ngrok or cloudflared tunnel to test webhooks
```

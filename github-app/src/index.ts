import { Hono } from 'hono';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { installYamtam } from './installer';

interface Env {
  APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;   // base64-encoded PEM
  GITHUB_WEBHOOK_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('Yana AI GitHub App — webhook receiver'));

app.get('/health', (c) => c.json({ status: 'ok', app: 'yana-github-app' }));

app.post('/webhook', async (c) => {
  const event = c.req.header('x-github-event');
  const body = await c.req.text();

  // Verify webhook signature
  const valid = await verifySignature(body, c.req.header('x-hub-signature-256') ?? '', c.env.GITHUB_WEBHOOK_SECRET);
  if (!valid) return c.json({ error: 'invalid signature' }, 401);

  const payload = JSON.parse(body);

  // Handle installation events
  if (event === 'installation' && payload.action === 'created') {
    const repos: Array<{ name: string; full_name: string }> = payload.repositories ?? [];
    const installationId: number = payload.installation.id;
    const results: string[] = [];

    for (const repo of repos) {
      try {
        const octokit = getOctokit(c.env, installationId);
        const [owner, repoName] = repo.full_name.split('/');
        const prUrl = await installYamtam({ octokit, owner, repo: repoName });
        results.push(`${repo.full_name} → ${prUrl}`);
        console.log(`[yana-ai] Installed on ${repo.full_name}: ${prUrl}`);
      } catch (err) {
        console.error(`[yana-ai] Failed on ${repo.full_name}:`, err);
        results.push(`${repo.full_name} → ERROR: ${err}`);
      }
    }

    return c.json({ installed: results });
  }

  // Handle repos added to existing installation
  if (event === 'installation_repositories' && payload.action === 'added') {
    const repos: Array<{ name: string; full_name: string }> = payload.repositories_added ?? [];
    const installationId: number = payload.installation.id;
    const results: string[] = [];

    console.log(`[yana-ai] repos_added count=${repos.length} installationId=${installationId}`);

    for (const repo of repos) {
      try {
        const octokit = getOctokit(c.env, installationId);
        const [owner, repoName] = repo.full_name.split('/');
        const prUrl = await installYamtam({ octokit, owner, repo: repoName });
        results.push(`${repo.full_name} → ${prUrl}`);
        console.log(`[yana-ai] Installed on ${repo.full_name}: ${prUrl}`);
      } catch (err) {
        const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
        console.error(`[yana-ai] Failed on ${repo.full_name}:`, msg);
        results.push(`${repo.full_name} → ERROR: ${msg}`);
      }
    }

    return c.json({ added: results });
  }

  return c.json({ received: event });
});

function getOctokit(env: Env, installationId: number): Octokit {
  const privateKey = atob(env.GITHUB_APP_PRIVATE_KEY);
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.APP_ID,
      privateKey,
      installationId,
    },
  });
}

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const expected = 'sha256=' + Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return signature === expected;
}

export default app;

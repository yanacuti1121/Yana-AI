import { Octokit } from '@octokit/rest';
import { TEMPLATES } from './templates';

interface InstallParams {
  octokit: Octokit;
  owner: string;
  repo: string;
}

export async function installYamtam({ octokit, owner, repo }: InstallParams): Promise<string> {
  // Get default branch
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const base = repoData.default_branch;

  // Get base SHA
  const { data: refData } = await octokit.git.getRef({
    owner, repo, ref: `heads/${base}`,
  });
  const baseSha = refData.object.sha;

  // Create branch yamtam/setup
  const branch = 'yamtam/setup';
  try {
    await octokit.git.createRef({
      owner, repo,
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });
  } catch {
    // Branch already exists — delete and recreate
    await octokit.git.deleteRef({ owner, repo, ref: `heads/${branch}` });
    await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseSha });
  }

  // Create/update each file
  for (const [path, content] of Object.entries(TEMPLATES)) {
    let sha: string | undefined;
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
      if ('sha' in data) sha = data.sha;
    } catch { /* file doesn't exist yet */ }

    await octokit.repos.createOrUpdateFileContents({
      owner, repo, path, branch,
      message: `chore: add YAMTAM safety config — ${path}`,
      content: btoa(unescape(encodeURIComponent(content))),
      ...(sha ? { sha } : {}),
    });
  }

  // Create PR
  const { data: pr } = await octokit.pulls.create({
    owner, repo,
    title: '🛡️ Add YAMTAM ENGINE safety config',
    head: branch,
    base,
    body: `## YAMTAM ENGINE — 1-click safety setup

This PR adds YAMTAM safety guardrails to your AI coding workflow.

### What's included

| File | Purpose |
|------|---------|
| \`CLAUDE.md\` | Core rules for Claude Code (evidence policy, scope discipline, hard blocks) |
| \`.claude/settings.json\` | Hooks that fire before/after every tool call |
| \`.claude/hooks/guard-destructive.sh\` | Blocks \`rm -rf\`, force-push, \`DROP TABLE\` |
| \`.claude/hooks/audit-log.sh\` | Logs all AI tool calls to \`.claude/state/audit.log\` |
| \`.claude/rules/golden-principles.md\` | 6 core coding principles |

### How it works

\`\`\`
AI agent attempts action
        ↓
guard-destructive.sh fires (PreToolUse hook)
        ↓
Dangerous? → BLOCKED with exit code 2
Safe?      → Execute + audit-log.sh logs it
\`\`\`

### Next steps

- Merge this PR to activate YAMTAM
- Customize \`CLAUDE.md\` for your project's specific rules
- Add more hooks from [yamtam-engine](https://github.com/phamlongh230-lgtm/yamtam-engine)

---
*Installed by [YAMTAM GitHub App](https://github.com/apps/yamtam-engine)*
`,
  });

  return pr.html_url;
}

import { Octokit } from '@octokit/rest';
import { TEMPLATES, CI_WORKFLOW } from './templates';

interface InstallParams {
  octokit: Octokit;
  owner: string;
  repo: string;
}

async function alreadyInstalled(octokit: Octokit, owner: string, repo: string, base: string): Promise<boolean> {
  try {
    await octokit.repos.getContent({ owner, repo, path: 'CLAUDE.md', ref: base });
    return true;
  } catch {
    return false;
  }
}

async function findOpenPR(octokit: Octokit, owner: string, repo: string, branch: string): Promise<number | null> {
  const { data: prs } = await octokit.pulls.list({ owner, repo, state: 'open', head: `${owner}:${branch}` });
  return prs.length > 0 ? prs[0].number : null;
}

export async function installYamtam({ octokit, owner, repo }: InstallParams): Promise<string> {
  // Get default branch
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const base = repoData.default_branch;

  // Check if YAMTAM already installed
  if (await alreadyInstalled(octokit, owner, repo, base)) {
    // Comment on latest commit instead of opening duplicate PR
    const { data: refData } = await octokit.git.getRef({ owner, repo, ref: `heads/${base}` });
    await octokit.repos.createCommitComment({
      owner, repo,
      commit_sha: refData.object.sha,
      body: `## ✅ YAMTAM ENGINE already installed

\`CLAUDE.md\` detected in this repo — YAMTAM safety config is already active.

To update your config, visit [yamtam-engine](https://github.com/phamlongh230-lgtm/yamtam-engine) for the latest rules.

---
*[YAMTAM GitHub App](https://github.com/apps/yamtam-engine)*`,
    });
    return `https://github.com/${owner}/${repo}/commit/${refData.object.sha}`;
  }

  // Get base SHA — repo might be empty (no commits yet)
  let baseSha: string;
  try {
    const { data: refData } = await octokit.git.getRef({
      owner, repo, ref: `heads/${base}`,
    });
    baseSha = refData.object.sha;
  } catch {
    // Empty repo — initialize with README then retry
    await octokit.repos.createOrUpdateFileContents({
      owner, repo, path: 'README.md', branch: base,
      message: 'chore: initialize repository',
      content: btoa(`# ${repo}\n`),
    });
    const { data: refData } = await octokit.git.getRef({
      owner, repo, ref: `heads/${base}`,
    });
    baseSha = refData.object.sha;
  }

  // Create branch yamtam/setup
  const branch = 'yamtam/setup';

  // Check if PR already open for this branch
  const existingPR = await findOpenPR(octokit, owner, repo, branch);
  if (existingPR) {
    return `https://github.com/${owner}/${repo}/pull/${existingPR}`;
  }

  try {
    await octokit.git.createRef({
      owner, repo,
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });
  } catch {
    await octokit.git.deleteRef({ owner, repo, ref: `heads/${branch}` });
    await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseSha });
  }

  // All files to install: templates + CI workflow
  const allFiles: Record<string, string> = {
    ...TEMPLATES,
    '.github/workflows/yamtam-audit.yml': CI_WORKFLOW,
  };

  for (const [path, content] of Object.entries(allFiles)) {
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
| \`CLAUDE.md\` | Core rules for Claude Code — evidence policy, scope discipline, hard blocks |
| \`.claude/settings.json\` | Hooks that fire before/after every tool call |
| \`.claude/hooks/guard-destructive.sh\` | Blocks \`rm -rf\`, force-push, \`DROP TABLE\` |
| \`.claude/hooks/audit-log.sh\` | Logs all AI tool calls to \`.claude/state/audit.log\` |
| \`.claude/rules/golden-principles.md\` | 6 core coding principles |
| \`.github/workflows/yamtam-audit.yml\` | CI gate — runs \`yamtam audit\` on every PR |

### How it works

\`\`\`
AI agent attempts action
        ↓
guard-destructive.sh fires (PreToolUse hook)
        ↓
Dangerous? → BLOCKED
Safe?      → logged + allowed
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

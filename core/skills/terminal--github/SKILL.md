---
name: terminal--github
description: >-
  >-
origin: "github.com/TerminalSkills/skills (skill: github)"
license: Apache-2.0
version: "1.0.0"
compatibility: "yana-ai >= 0.14.0"
---

# GitHub

## Overview

Interact with GitHub repositories using the `gh` CLI tool. Handles issues, pull requests, CI/CD runs, releases, and advanced search queries without leaving the terminal. Supports creating, listing, reviewing, and managing all core GitHub resources.

## Instructions

When a user asks you to interact with GitHub, follow this process:

### Step 1: Verify gh CLI is available

Run `gh --version` to confirm the CLI is installed. If not installed, instruct the user to install it:

```bash
# macOS
brew install gh

# Linux
sudo apt install gh  # or snap install gh

# Then authenticate
gh auth login
```

Check authentication status with `gh auth status`.

### Step 2: Determine the repository context

- If inside a git repo, `gh` auto-detects the remote. Confirm with `gh repo view --json nameWithOwner -q .nameWithOwner`.
- If the user specifies a repo (e.g., `owner/repo`), use the `-R owner/repo` flag on all commands.
- If neither, ask the user which repository to target.

### Step 3: Execute the requested action

**Issues:**

```bash
# List open issues
gh issue list

# Create an issue
gh issue create --title "Bug: login fails" --body "Steps to reproduce..."

# View issue details
gh issue view 42

# Close an issue
gh issue close 42 --comment "Fixed in #55"

# Search issues across repos
gh search issues "memory leak" --repo owner/repo --state open
```

**Pull Requests:**

```bash
# List open PRs
gh pr list

# Create a PR from the current branch
gh pr create --title "Add caching layer" --body "## Summary\n- Added Redis caching"

# View PR details including checks
gh pr view 123

# Review a PR (approve, comment, request changes)
gh pr review 123 --approve --body "Looks good"

# Merge a PR
gh pr merge 123 --squash --delete-branch

# Check out a PR locally
gh pr checkout 123
```

**CI/CD Runs:**

```bash
# List recent workflow runs
gh run list --limit 10

# View a specific run
gh run view 123456

# Watch a running workflow
gh run watch 123456

# View failed job logs
gh run view 123456 --log-failed

# Re-run failed jobs
gh run rerun 123456 --failed
```

**Releases:**

```bash
# List releases
gh release list

# Create a release from a tag
gh release create v1.2.0 --title "v1.2.0" --generate-notes

# Download release assets
gh release download v1.2.0
```

**Advanced Queries with gh api:**

```bash
# Get repo stats
gh api repos/owner/repo --jq '.stargazers_count, .forks_count'

# List PR review comments
gh api repos/owner/repo/pulls/123/comments

# Search code across GitHub
gh search code "TODO FIXME" --repo owner/repo --filename "*.ts"
```

### Step 4: Format and present results

- Summarize results clearly. For lists, show the most relevant fields (number, title, status, author).
- For long outputs, highlight the key information rather than dumping raw output.
- When creating resources, confirm the URL of the created item.

## Examples

### Example 1: Create a bug report issue

**User request:** "Create a GitHub issue for the login timeout bug"

**Actions:**

```bash
gh issue create \
  --title "Bug: Login times out after 30 seconds on slow connections" \
  --body "## Description
Users on slow connections experience a timeout during login.

## Steps to Reproduce
1. Throttle network to Slow 3G
2. Navigate to /login
3. Submit credentials
4. Observe timeout error after 30s

## Expected Behavior
Login should succeed or show a retry option.

## Environment
- Browser: Chrome 120
- OS: macOS 14.2" \
  --label "bug,priority:high"
```

**Output:** "Created issue #87: Bug: Login times out after 30 seconds on slow connections — https://github.com/owner/repo/issues/87"

### Example 2: Check why CI is failing

**User request:** "Why is CI failing on my PR?"

**Actions:**

```bash
# Get the current PR
gh pr view --json number,headRefName,statusCheckRollup

# List runs for the current branch
gh run list --branch feature/my-branch --limit 5

# View the failed run logs
gh run view 789012 --log-failed
```

**Output:** Summarize the failure cause, the specific job and step that failed, and suggest a fix based on the error logs.

### Example 3: Search for related issues before creating a new one

**User request:** "Is there already an issue about dark mode?"

**Actions:**

```bash
gh search issues "dark mode" --repo owner/repo --limit 10
gh issue list --search "dark mode" --state all
```

**Output:** List matching issues with their number, title, state, and labels. Recommend whether to create a new issue or comment on an existing one.

## Guidelines

- Always check `gh auth status` before running commands if there is any doubt about authentication.
- When creating PRs, use the `--body` flag with a structured description including Summary and Test Plan sections.
- For destructive operations (closing issues, merging PRs, deleting branches), confirm with the user first.
- Use `--json` and `--jq` flags to extract specific fields when raw output is too verbose.
- When searching, start broad and narrow down. Use `--state`, `--label`, `--author` filters.
- Prefer `gh pr create` over manual git push + web UI for a streamlined workflow.
- For large repos with many issues/PRs, always use `--limit` to avoid overwhelming output.

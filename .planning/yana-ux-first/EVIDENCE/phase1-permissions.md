# Phase 1 evidence: how other tools ask for permission

Fetched 2026-10-30 with WebFetch. Only facts stated on the fetched pages are listed. Nothing here says whether Yana already has the same thing.

## VS Code Workspace Trust
Source: https://code.visualstudio.com/docs/editor/workspace-trust

- A new folder opens in Restricted Mode with a banner; the setting `security.workspace.trust.startupPrompt` decides whether a dialog appears (`never` is the default per the page, `once` asks the first time a distinct folder is opened).
- Restricted Mode limits AI agents, terminal, tasks, debugging, workspace settings and extensions; terminals, tasks and debugging show a confirmation when used.
- Trust is remembered in the "Trusted Folders & Workspaces" list, which can be edited.
- Adding a parent folder to that list trusts it and all its subfolders.

## Claude Code permissions
Source: https://code.claude.com/docs/en/permissions

- Permission modes named on the page: `acceptEdits` (accepts file edits and common filesystem commands for paths in the working directory or `additionalDirectories`), `dontAsk` (auto-denies every call that would prompt), `bypassPermissions` (skips prompts except actions no mode auto-approves), plus plan mode and an auto mode where a classifier reviews actions instead of the user.
- "Yes, and don't ask again" persists differently by tool type: Bash permanently per repository and command, file modification until session end, WebFetch permanently per repository and domain.
- Rules are allow, ask and deny entries kept in settings files; the page states "Permission rules are enforced by Claude Code, not by the model."
- `permissions.disableBypassPermissionsMode` and `permissions.disableAutoMode` set to `"disable"` prevent those modes from being used.

## Not obtained
- OpenAI Codex approval modes: the official docs URL redirected to a domain that could not be confirmed as official, and the GitHub page fetch hit the usage limit. No claim is made.

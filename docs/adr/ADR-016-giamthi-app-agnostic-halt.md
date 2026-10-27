# ADR-016: App-Agnostic Giám Thị HALT (OS-Level Enforcement)

**Status:** Accepted 2026-09-29 by the project owner. Layers 1 and 2
implemented in `core/scripts/giamthi_oslock.py` (macOS only). Layer 3 not
implemented here (see below).
**Date:** 2026-09-29
**Decision owner:** Human project owner

## Problem

`GIAMTHI_HALT.lock` is enforced only by hooks the AI host chooses to run:

- Claude Code: `PreToolUse` on every tool. Works (confirmed live 2026-09-29:
  Bash and Read were both denied while HALT was active).
- Codex CLI: `PreToolUse` fires for shell only, so
  `core/hooks/giamthi-halt-check.sh` is also registered on `SessionStart` and
  `UserPromptSubmit`. Still host-cooperative.
- Codex desktop app and any other app that does not load this repo's hook
  config: nothing stops them. The owner observed the Codex app keep working
  during a HALT.

The lock is a file on disk. A process that never reads it is not affected by
it. The acceptance criterion for this ADR is therefore: **a HALT must stop the
Codex app from modifying the repo without any cooperation from the Codex app.**

## Options considered

| Option | Stops a non-cooperating app? | Outcome |
|---|---|---|
| More host hooks / adapters | No, each host must opt in | Kept as tier 1, not sufficient |
| MCP gate (Program J) | No, only covers tools routed through yana-rt | Not sufficient alone |
| `chmod a-w` / `chflags uchg` | No, the owning user (and any app running as that user) can revert it | Rejected |
| `chflags schg` via root helper | Yes for writes: only root can set or clear `schg` | **Implemented (primary)** |
| `SIGSTOP` known AI app processes | Yes for all activity, if the process is matched | **Implemented (secondary)** |
| git `pre-commit`/`pre-push` check | Partially, bypassed by `--no-verify` | Dropped: `schg` on `.git/` already blocks commits |
| GitHub branch protection (required review, `enforce_admins`) | Yes for `main` on the remote | Separate config change, pending |
| macOS Endpoint Security client | Yes | Rejected: needs an Apple-granted entitlement |

## Decision

Giám thị becomes two independent tiers:

- **Tier 1** (existing): user-level watcher (`giamthi-watch.sh`, launchd
  agent) writes the lock; host hooks deny tool calls while it exists.
- **Tier 2** (new): root daemon that enforces the lock at the OS level, for
  every app, with no host cooperation.

### Layer 1: immutable project tree (primary)

1. Root `LaunchDaemon` `/Library/LaunchDaemons/com.yanaai.giamthi-oslock.<id>.plist`
   with `WatchPaths` on `.claude/state/GIAMTHI_HALT.lock`, plus a 60 second
   fallback poll and `RunAtLoad`.
2. When the lock file exists, the daemon runs a root-owned script
   (`/Library/PrivilegedHelperTools/com.yanaai.giamthi-oslock.<id>.sh`,
   `root:wheel`, mode 0755, not inside the repo; `/usr/local` is avoided
   because Homebrew often makes it user-owned, which would let a user
   process swap the script) that sets `schg` on every file and directory of
   the project tree, including `.git/` (blocks commits, ref updates, index
   writes) and the lock file itself (cannot be deleted).
   Excluded: `node_modules/`, `target/`, and `.claude/state/`, so watcher
   reports and heartbeats keep writing.
3. The script never runs git: git config such as `core.fsmonitor` would let
   repo content execute code as root. It walks the tree with
   `find -P -xdev` and `chflags -h`, so symlinks are never followed, and it
   refuses to run if the repo path is a symlink, resolves differently, or has
   a different owner than at install time. All inputs (repo path, owner uid,
   process names) are baked in as shell-quoted literals at install time.
4. The daemon only locks. Unlock is a separate human command:
   `yana-ai giamthi unlock .`. It runs `sudo -k` first (drops any cached
   credential), refuses without a terminal, then runs the root script's
   `unlock`, which clears `schg`, deletes the lock file, and resumes frozen
   processes. The password prompt is the human-review ceremony.

Why root and not the user's own `uchg`: any process running as the user,
including the Codex app and its sandbox, can clear `uchg`. It cannot clear
`schg`.

### Layer 2: process freeze (secondary)

On lock, the script sends `SIGSTOP` to processes owned by the project owner
whose exact name is in the built-in list (`Codex`, `codex`, `Cursor`,
`Antigravity`, `Windsurf`), records their PIDs under
`/var/db/yana-giamthi/<id>/frozen`, and sends `SIGCONT` on unlock. This
covers non-write activity (network, push) that Layer 1 does not. It depends
on correct process names, so it is secondary: an app missing from the list
is still stopped from writing by Layer 1.

### Layer 3: remote protection (pending)

GitHub branch protection on `main`: required review count >= 1,
`enforce_admins: true`. Closes the gap already recorded in
`49-immutable-infrastructure-law.md`. This is a repo settings change and
needs its own explicit approval.

## Installation

Every installer (`install.sh`, `yana-ai install`, the npm installer when
interactive) now defaults to installing Giám thị tier 1. With a terminal,
`giamthi_service.py install` then asks a separate (Y/n) question for tier 2
that states what it does (root, read-only project during HALT, pauses named
apps, needs sudo), and only then prompts for the password. Without a
terminal, or with `--no-oslock`, tier 2 is skipped and the follow-up command
(`yana-ai giamthi install-oslock .`) is printed; a tier 2 failure never fails
the tier 1 install. npm postinstall (`--auto`) never registers OS services.

Headless and CI note: with no terminal, `install.sh` and `yana-ai install`
now register the tier 1 user-level service by default (previously skipped).
Opt out with `YANA_SUPERVISOR=skip` (`install.sh`) or `--supervisor skip`
(`yana-ai install`).

Root files are never copied from a temp file: the script and plist are piped
into `sudo tee` inside root-only directories (the installer refuses if
`/Library/PrivilegedHelperTools` or `/Library/LaunchDaemons` is not
root-owned and non-writable by group/other), then `chown`/`chmod`, then read
back and compared by SHA-256; a mismatch removes the file and aborts. A temp
file would let a same-user process swap its content while the human types
the password (found in the rule-54 security review).

Commands: `install-oslock`, `unlock`, `uninstall-oslock` (refuses while the
lock is engaged), and `status` now reports tier 2.

## Trust-model changes and new risks

- **New root component.** A root daemon is new attack surface. Mitigations
  are listed in Layer 1 step 3. Worst case of a manipulated run is `schg` set
  on files the owner controls (denial of service), not code execution.
- **Lock race (residual, accepted).** Between the watcher writing the lock
  and the daemon applying `schg` there is a short window (normally under a
  second with `WatchPaths`). A same-user process that deletes the lock file
  inside that window makes the daemon's existence check fail, so tier 2 does
  not engage for that HALT. The watcher still reports the HALT (notification
  plus report log), and if the drift is still present its next run writes the
  lock again, so the attacker has to win the race every time. After lock,
  deleting the lock file no longer releases anything: `schg` state, not the
  lock file, is authoritative. A lock signal that a user process cannot
  delete would need the tier 1 watcher itself to run as root; not done here.
- **Denial of service.** Any process can create the lock file and freeze the
  repo. Accepted: fail-closed, and the owner can always unlock with `sudo`.
- **Owner is locked out too.** While HALT is engaged the owner cannot edit the
  repo either. This is intended: review first, then unlock.
- **Freezing a whole app.** `SIGSTOP` on Codex or Cursor also pauses their
  work on other projects until unlock.
- **macOS only.** Linux (`chattr +i` via a root systemd path unit) and
  Windows are not implemented.

## Verification

Automated (`tests/test_giamthi_oslock.py`): the rendered root script is run
for real as a normal user (lock detection, marker, log, unlock cleanup,
symlink refusal), shell quoting is checked against hostile paths, and the
script is checked never to invoke git.

Manual, required before calling tier 2 verified:

1. Start a real Codex app session on a scratch clone. Trigger HALT.
2. Confirm: Codex file edits fail with `Operation not permitted`, `git commit`
   fails, the Codex process is stopped (`ps -o stat` shows `T`).
3. Confirm from the user account (no sudo): `chflags noschg` fails.
4. Run `yana-ai giamthi unlock .`: writes work again, Codex resumes.

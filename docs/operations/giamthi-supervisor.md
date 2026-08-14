# Giám thị OS Supervisor

Yana AI uses two independent enforcement layers:

1. Project hooks block supported Claude, Codex, and Cursor events while
   `.claude/state/GIAMTHI_HALT.lock` exists.
2. An operating-system supervisor runs outside AI sessions, audits the project,
   and may create that shared lock. Unlocking requires an explicit human
   ceremony with actor and reason, recorded before the lock is removed.

## Component responsibilities

| Component | Purpose | Resident? | Authority? | Live today? |
|---|---|---:|---:|---:|
| Claude/Codex/Cursor hooks | Enforce the shared safety state | No | No | Yes |
| Native supervisor authority | HALT, quarantine, receipts, heartbeat and dashboard | No | **Yes** | Yes |
| Periodic supervisor scheduler | Invoke one-shot supervisor ticks | No | No | Yes |
| Compatibility integrity watcher | Audit integrity and create HALT findings | No | Can halt; cannot unlock | Yes |
| Resident service | Maintain continuous native tick availability | **Yes** | No | Yes |
| Python compatibility installer | Install the shell watcher where native installation is unavailable | No | No | Yes |

When `yana-rt` is available, the native scheduler runs
`yana-rt os supervisor tick`. The tick collects CPU, memory, disk, GPU, Yana
health, heartbeat SLO, managed-agent/session counts, and a tamper-evident
receipt chain. The Python manager remains the cross-package installation
fallback rather than a second monitoring authority.

The optional resident service is a separate execution model. It remains alive
between ticks and is managed with `yana-rt os service ...`. Do not confuse it
with the periodic scheduler.

## Install

Persistent OS registration is explicit:

```bash
yana-ai install . --supervisor install
# or
yana-ai giamthi install .
```

Interactive `yana-ai install` asks first. Non-interactive installs skip the
supervisor unless `--supervisor install` or `YANA_SUPERVISOR=install` is set.

The manager installs one project-scoped service every six hours:

- macOS: `~/Library/LaunchAgents/com.yanaai.giamthi-watch.<hash>.plist`
- Linux: `~/.config/systemd/user/yana-giamthi-<hash>.{service,timer}`
- Windows: `YanaAI-GiamThi-<hash>` in Task Scheduler

Windows currently requires Git for Windows (or another Bash installation),
because the audit worker remains `giamthi-watch.sh`.

macOS protects Desktop and Documents from many background LaunchAgents. The
installer verifies the first scheduled run and fails with an actionable exit
126 diagnostic instead of reporting a dead job as healthy. Prefer a checkout
under `~/Projects`; alternatively grant the chosen supervisor executable Full
Disk Access before retrying with `yana-ai giamthi repair . --allow-protected-path`.

## Operate

```bash
yana-ai giamthi status .
yana-ai giamthi run .
yana-ai giamthi repair .
yana-ai giamthi uninstall .

# Native runtime dashboard and controls
yana-rt os supervisor status --dir .
yana-rt os supervisor self-test --dir .
yana-rt os supervisor scheduler status --dir .
yana-rt os service status --dir .
yana-rt os supervisor quarantine set no-shell --reason "investigation" --actor "$USER" --dir .
yana-rt os supervisor quarantine clear --approve --reason "review complete" --actor "$USER" --dir .
yana-rt os supervisor unlock --approve --reason "human review complete" --actor "$USER" --dir .
```

`yana-rt os supervisor service ...` remains a deprecated compatibility alias
for `supervisor scheduler ...`. The resident lifecycle is only `os service`.

`status` reports stale macOS LaunchAgents that point to another checkout.
`repair` rewrites and reloads the definition for the requested target.
`uninstall` removes only OS scheduling. It deliberately preserves the HALT
lock, reports, heartbeat, and audit evidence.

## Recovery

Do not delete a reported stale service automatically: it may intentionally
protect another checkout. Review its target first, then run `uninstall` using
that exact target. A halt remains active until a human reviews the report and
removes `.claude/state/GIAMTHI_HALT.lock` manually.

Quarantine is a reduced-capability mode (`read-only`, `no-shell`, or
`no-network`) enforced by Claude, Codex, and Cursor bridges. If Cursor does not
identify the current hook event, it fails closed rather than guessing.

The dashboard reports the periodic scheduler, resident service and compatibility
watcher independently. Definition presence, OS registration, running state and
unknown/unavailable state are not collapsed into one boolean. It also reports
`service_definition_drift` as `clear`, `detected`, or `unknown`, with paths and
embedded checkout targets for discovered macOS launchd, Linux systemd-user, and
Windows Task Scheduler definition files. Detection is read-only; the dashboard
never deletes or rewrites another checkout's registration. It also reports
the native runtime version and whether the macOS binary passes `codesign --verify`.
This is a diagnostic only: Yana does not claim a trusted signature without a
real Developer ID and notarization. Linux systemd-user and Windows Task
Scheduler invoke the native binary directly; Windows Service Control Manager
daemonization remains outside this slice.

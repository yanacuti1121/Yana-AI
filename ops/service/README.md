# Always-On Service Assets

The canonical installer is now the native CLI:

```bash
yana-rt os service install --dir /absolute/project/path
yana-rt os service status --dir /absolute/project/path --json
```

The files under `ops/service/` are review/reference examples only. The CLI
renders a project-specific definition with a stable identity and the exact
current `yana-rt` binary path; it does not copy these templates.

| Platform | Runtime model | Canonical lifecycle |
|---|---|---|
| macOS | per-user LaunchAgent, `KeepAlive=true` | `launchctl bootout/bootstrap/kickstart` |
| Linux | per-user systemd, `Restart=always` | `systemctl --user enable --now` |
| Windows | Task Scheduler logon task + restart-on-failure | `schtasks /Create`, `/Run`, `/End`, `/Delete` |

Windows Task Scheduler is not a Windows SCM Service. The CLI reports its live
running state as `UNKNOWN` rather than guessing from localized text.

The resident command is:

```text
yana-rt os service run --dir <project> --interval-secs <seconds>
```

It calls the canonical native supervisor tick in-process. It never clears
HALT. During HALT it remains alive but performs no ticks, preventing the OS
restart policy from creating a respawn loop.

The periodic scheduler is separate:

```bash
yana-rt os supervisor scheduler status --dir .
```

Do not install the reference templates manually unless you intentionally take
over definition-path, service-identity and rollback management from the CLI.

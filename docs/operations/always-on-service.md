# Always-On Giám Thị Resident Service

**Status:** Wired to the native CLI. `yana-rt os service run` is a real
long-running process. It stays alive between supervisor ticks and is distinct
from the periodic scheduler.

## Control-plane map

| Component | Purpose | Resident? | Authority? | Live today? |
|---|---|---:|---:|---:|
| Cross-engine hooks | Enforce HALT/quarantine before supported host events | No | No; reads shared safety state | Yes |
| `os::supervisor` | Own HALT, quarantine, receipts, heartbeat, dashboard and human unlock ceremony | No | **Yes** | Yes |
| `os::monitor_service` | Schedule one-shot `supervisor tick` calls | No | No | Yes |
| `giamthi-watch.sh` + Python installer | Compatibility integrity watcher and cross-package installer | No | May create HALT; never clears it | Yes |
| `os::service::runtime` | Stay alive and call native supervisor ticks | **Yes** | No; obeys shared HALT | Yes |
| `os::service::watchdog` | Reusable governed-child restart/backoff primitive | Only when embedded by a caller | No | Library primitive |

## CLI

```bash
# Resident process lifecycle
yana-rt os service install --dir . --interval-secs 60
yana-rt os service status --dir . --json
yana-rt os service stop --dir .
yana-rt os service start --dir .
yana-rt os service restart --dir .
yana-rt os service uninstall --dir .

# Internal payload installed by the manager; normally do not run manually
yana-rt os service run --dir . --interval-secs 60

# Periodic scheduler: explicitly different
yana-rt os supervisor scheduler status --dir .
```

The former `yana-rt os supervisor service ...` spelling remains a compatibility
alias for `supervisor scheduler`; it does **not** manage the resident process.

## Runtime behavior

The resident payload:

1. acquires one project-specific single-instance lock;
2. calls `os::supervisor::tick()` at a bounded interval (minimum five seconds);
3. uses bounded exponential backoff after tick errors;
4. keeps the process alive but performs no ticks while
   `.claude/state/GIAMTHI_HALT.lock` exists;
5. never deletes HALT or quarantine state.

Remaining alive during HALT is intentional. Exiting would make launchd
`KeepAlive` or systemd `Restart=always` repeatedly respawn prohibited work.
After a human clears HALT through the existing ceremony, the resident loop
resumes on its next interval.

On macOS and Linux, single-instance ownership uses the canonical `flock-v1`
regular-file protocol and therefore requires the repository's protocol marker.
On Windows, Task Scheduler prevents duplicate scheduled instances and the
payload also uses fail-closed instance evidence. An unclean Windows crash can
leave that evidence behind; human review is required rather than automatic
stale-lock deletion.

## Installation semantics

The manager writes definitions atomically, refuses symlink/non-regular
replacement and executes argv arrays directly—never shell strings. Installation
then verifies registration and live state. If writing, activation or verification
fails, it deregisters the attempted service and restores prior definitions.

- **macOS:** per-user LaunchAgent, `KeepAlive=true`, managed through
  `launchctl bootout/bootstrap/kickstart`. Desktop, Documents and Downloads are
  rejected by default because TCC can deny background access. Move the checkout
  under `~/Projects`, or grant Full Disk Access and explicitly pass
  `--allow-protected-path`.
- **Linux:** per-user systemd service, `Restart=always`, `ProtectSystem=strict`,
  `ProtectHome=read-only`, with write access limited to `.yana-ai/os` and
  `.claude/state`.
- **Windows:** Task Scheduler with a logon trigger, immediate `/Run` and
  restart-on-failure. This is **not** a Windows SCM Service. Registration is
  verified; running state remains `UNKNOWN` because localized `schtasks` output
  is not parsed as an English-only contract.

`stop` preserves the definition/registration where the platform permits;
`uninstall` deregisters and removes it. HALT, quarantine, receipts and health
evidence are never removed by service uninstall.

## Status and recovery

`os service status` distinguishes:

- definition present (`installed`);
- OS registration (`registered`: true/false/unknown);
- live execution (`running`: true/false/unknown);
- stable project service identity;
- definition paths and runtime version.

A definition file is never reported as proof that the process is healthy.
Use `yana-rt os supervisor status --json` for the combined scheduler, resident,
compatibility-watcher, host-health and safety dashboard. Its
`service_definition_drift` section reports definitions that point at another
checkout (or cannot be inspected) without deleting them; `unknown` remains
distinct from a confirmed empty result.

Do not manually delete a live service definition. Stop/uninstall through the CLI
so OS registration and disk state remain coordinated. Never remove a flock file;
kernel ownership is the lock, and the canonical inode is intentionally stable.

## Governed child primitive

`src/os/service/watchdog.rs` remains available for components that genuinely
need a supervised child. It uses argv-only spawn attribution, bounded backoff,
process-group cleanup on Unix, and checks HALT both before spawn and while the
child runs. The resident Giám Thị payload does not wrap its own tick in this
watchdog because a one-shot tick is not a resident child workload.

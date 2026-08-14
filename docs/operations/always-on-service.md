# Always-On yana-rt Service (foundation)

**Status:** Foundation only. `src/os/service/` and `src/monitor/` exist
and are unit-tested, but nothing in this repository calls them yet — no
`OsAction` CLI variant, no `main.rs` wiring, no scheduled install. This
document describes what exists today and what a future integration PR
would need to add to actually run it in production.

## What this is, and what it is not

Three things in `src/os/` sound similar. They are not the same layer:

| Module | What it does | Resident process? |
|---|---|---|
| `os::monitor` | Collects one CPU/memory/disk/GPU/host snapshot and persists it to `.yana-ai/os/system-health.json`. | No — a single sample per invocation. |
| `os::monitor_service` | Installs a **periodic** launchd/systemd-timer/Task-Scheduler definition that invokes `yana-rt os supervisor tick` on a fixed interval. Its own doc comment states this "avoids a custom always-resident daemon." | No — periodic tick, by explicit design. |
| `os::supervisor` | Halt/unlock/quarantine authority: owns `.claude/state/GIAMTHI_HALT.lock`, hash-chained receipts, the human-only-clearable safety gate every engine (Claude Code, Codex) already respects. | No — it is authority, not a process. |
| `os::service` (this document) | Installs an OS service definition that keeps a program **continuously running** (`KeepAlive`/`Restart=always`), plus a watchdog loop that restarts it with bounded backoff on exit. | **Yes** — this is the resident-process layer. |

`os::service` sits above the other three and reuses their conventions
rather than duplicating them:

- Halt-lock path (`.claude/state/GIAMTHI_HALT.lock`) and the "only a human
  clears it" asymmetry: reused verbatim from `os::supervisor`.
- Atomic, no-symlink-follow, `0600`-permission file writes and
  `std::process::Command`-only (never a shell string) service-definition
  installation: the same pattern `os::monitor_service` already
  established and proved across macOS/Linux/Windows.
- Project-specific naming derived from a SHA-256 of the working
  directory: the same `project_id` idea `os::monitor_service` uses,
  renamed `identity()` here since it now covers a service *name* too, not
  only a project path.

## What exists today

```
src/monitor/
  backoff.rs   BoundedBackoff — exponential doubling capped at max,
               resets to initial after a stable run (ZeroClaw's
               validated algorithm, adopted as-is; read-only reference,
               never forked/embedded)
  health.rs    HealthState (Healthy/Degraded/Restarting/Backoff/Halted/
               HumanRequired), ComponentHealth, in-memory HealthRegistry,
               ServiceHealthSnapshot

src/os/service/
  manager.rs      ServiceDefinition, ServiceStatus, ServiceManager
                  (install/start/stop/restart/status/uninstall), shared
                  atomic-write + Command-invoke plumbing
  launchd.rs      macOS: renders a KeepAlive=true plist, launchctl
                  load/unload
  systemd.rs      Linux (per-user): renders a Restart=always .service
                  unit, systemctl --user enable/disable --now
  windows.rs      Windows: renders a Task Scheduler XML definition with
                  a logon trigger + RestartOnFailure — Task Scheduler,
                  not a real Windows Service (SCM); the same disclosed
                  ceiling as os::monitor_service and the ZeroClaw
                  reference this design drew from, since a real Windows
                  Service needs the `windows-service` crate and adding a
                  new dependency was out of scope for this change
                  (Cargo.toml was frozen for this PR)
  attribution.rs  Governed spawn: argv array only (never a shell
                  string), PID + owner + redacted argv recorded to an
                  append-only JSONL receipt at
                  .yana-ai/os/service-spawn-receipts.jsonl. Plain JSONL,
                  not hash-chained like os::supervisor's safety receipts
                  — this is operational attribution, not a tamper-
                  evidence chain. A deliberate scope boundary, not an
                  oversight.
  watchdog.rs     Watchdog::run_once/supervise — spawns via
                  attribution::spawn, waits for exit, checks
                  GIAMTHI_HALT.lock fail-closed before every restart
                  decision, computes the next backoff via
                  monitor::BoundedBackoff, updates monitor::HealthRegistry
```

`src/monitor/` is declared from `src/os/service/mod.rs` (not from
`src/os/mod.rs`, and never from `src/main.rs`) via
`#[path = "../../monitor/mod.rs"] pub mod monitor;`, specifically to
avoid colliding with the pre-existing `os::monitor` module name while
still placing the physical directory at the top level, as the owning
task's brief asked for. The directory lives at `src/monitor/`; it is
reachable in code as `crate::os::service::monitor`.

## Halt-lock fail-closed behavior

Before every restart decision, `Watchdog::run_once` checks whether
`<project_root>/.claude/state/GIAMTHI_HALT.lock` exists. If it does, the
watchdog transitions the component to `HealthState::Halted` and stops —
it does not spawn anything, and there is no bypass path. This is the same
lock `core/hooks/giamthi-halt-check.sh` and `os::supervisor::halt()`/
`unlock()` already use; a halt raised through any of those surfaces stops
this watchdog too, without this module needing to know anything about how
the halt was raised.

## Governed spawn attribution

Every process the watchdog starts goes through `attribution::spawn`,
which:

- Spawns via `std::process::Command::new(program).args(args)` — never a
  shell string, per `shell-sanitize-law.md`.
- Records `{pid, owner: {agent_id, session_id, mission_id}, argv_redacted,
  timestamp}` to `.yana-ai/os/service-spawn-receipts.jsonl`.
- Redacts argv tokens matching `--token=`, `--key=`, `--api-key=`,
  `--password=`, `--secret=`, `--auth=`, or that look like a bearer/API-key
  literal (long, no-whitespace, mixed-alphanumeric). This is a
  conservative audit-log hygiene heuristic, not the security boundary
  itself — see `52-secrets-vault-law.md` for that.
- Never records environment variables at all.

## What a future integration PR would need to add

This PR deliberately stops short of production wiring:

1. An `OsAction::Service` (or similarly named) CLI variant in
   `src/main.rs`/`src/os/mod.rs` that constructs a `ServiceDefinition`
   pointing at a real long-running subcommand (e.g. a future
   `yana-rt os service run` that itself drives a `Watchdog` in a loop).
2. A decision on what the *supervised program* actually is — this PR
   builds the supervisor, not a new resident payload to supervise. The
   most natural first target is a thin wrapper around
   `os::supervisor::tick()`'s existing responsibilities, but that is an
   explicit design choice for the integration PR, not assumed here.
3. Updating `ops/service/`'s example templates from "example" naming to
   whatever the real installed command line ends up being once (1) is
   decided.
4. Deciding whether `attribution.rs`'s spawn receipts should be promoted
   to `os::supervisor`'s hash-chained format, if the operational log
   above is ever asked to serve as safety evidence rather than
   operational attribution.

## Testing

All new code is hermetic: `src/monitor/**`'s tests are pure `Duration`
arithmetic and in-memory state, no I/O. `src/os/service/**`'s tests use
real temporary directories and, where a real child process is needed
(`attribution.rs`, `watchdog.rs`), real short-lived `/bin/sh -c 'exit N'`
processes — never a real `launchctl`/`systemctl`/`schtasks` install, and
never a real halt lock outside a temp directory made for that one test.

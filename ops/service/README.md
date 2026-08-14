# Always-On Service Assets (foundation, not yet wired)

These templates are examples for the resident always-on `yana-rt` service
that `src/os/service/` implements the OS-install/watchdog *foundation*
for. **`yana-rt os service run` does not exist yet** — no `OsAction`
variant calls into `src/os/service/` yet, by explicit design for this
change (see `docs/operations/always-on-service.md`). These templates
describe the shape a future CLI wiring PR would install; do not install
them expecting a working command today.

Once that wiring lands, the intended flow mirrors `ops/release-gate/`'s
own installation model:

## Installation (once `os service` is wired)

1. Create a dedicated unprivileged `yana` account and an isolated project
   checkout, matching `ops/release-gate/README.md`'s own guidance.
2. Replace `/srv/yana-ai-project`, `/usr/local/bin/yana-rt`, and the log
   paths in the template with paths owned by that account.
3. Install one template on each host:
   - **macOS**: copy `launchd/com.yana.service.plist` to
     `~/Library/LaunchAgents/` (per-user) or the LaunchDaemon location,
     then `launchctl load <path>`.
   - **Linux**: copy `systemd/yana-service.service` to
     `~/.config/systemd/user/` (per-user) or `/etc/systemd/system/`
     (system-wide), then `systemctl daemon-reload` and
     `systemctl --user enable --now yana-service.service`.
   - **Windows**: not templated here — `src/os/service/windows.rs`
     generates a Task Scheduler XML definition programmatically (no
     static template checked in), with the same disclosed ceiling as
     `ops/release-gate` and `os::monitor_service` on this platform: Task
     Scheduler, not a real Windows Service (SCM).
4. `src/os/service::manager::ServiceManager` generates the equivalent of
   these files programmatically per-project (naming derived from the
   project's working directory, matching `os::monitor_service`'s own
   `project_id` convention) — these checked-in copies are documentation
   examples, not what a future `install` command reads from disk.

## Why `KeepAlive`/`Restart=always` instead of a periodic tick

`ops/release-gate`'s own templates and `os::monitor_service`'s existing
installer are periodic (a scheduled `Type=oneshot` run, or a timer). This
service is different on purpose: `KeepAlive=true` (launchd) and
`Restart=always` (systemd) ask the OS to keep the process continuously
running, restarting it on exit — the actual "always-on" behavior this
directory's name promises. The watchdog logic in
`src/os/service/watchdog.rs` (bounded exponential backoff, halt-lock
fail-closed) exists specifically because a naive "always restart" loop
without backoff can hammer a host during a genuine crash loop; the OS
service manager's own restart directive and this crate's watchdog are
complementary, not redundant — see `docs/operations/always-on-service.md`
for how a future wiring PR is expected to combine them.

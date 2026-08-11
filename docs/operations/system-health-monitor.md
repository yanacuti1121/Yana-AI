# Yana System Health Monitor

The monitor is part of `yana-rt`; it does not upload telemetry and does not
require a cloud service.

## Collect once

```bash
yana-rt os monitor sample --dir /path/to/project
yana-rt os monitor show --dir /path/to/project
```

Add `--json` for the machine-readable schema. The latest snapshot is stored at
`.yana-ai/os/system-health.json`. It contains host resource metrics, GPU
inventory/metrics when supported, and local Yana runtime health. It does not
contain prompts, messages, credentials, or environment dumps.

## Enable automatic sampling

This is intentionally a one-time explicit action:

```bash
yana-rt os monitor service install --dir /path/to/project --interval-secs 60
```

After that, the operating system runs the sampler automatically at login and
on the configured interval:

| Platform | Native scheduler |
|---|---|
| macOS | per-user LaunchAgent |
| Linux | systemd user timer + one-shot service |
| Windows | per-user Task Scheduler task |

Package installation never silently enables the service. The minimum interval
is 30 seconds on macOS/Linux and 60 seconds on Windows (Task Scheduler's
minute-level repetition contract). Overlapping Windows task instances are
disabled.

Inspect or remove it with:

```bash
yana-rt os monitor service status --dir /path/to/project
yana-rt os monitor service uninstall --dir /path/to/project
```

## GPU evidence

`nvidia-smi` provides NVIDIA utilization and memory metrics when installed.
macOS `system_profiler`, Linux DRM sysfs, and Windows CIM provide inventory
fallbacks. Those fallbacks explicitly report `inventory-only`; they do not
pretend that an unavailable utilization value is zero.

AMD/Intel utilization depends on optional vendor tools and is not yet exposed.
The GPU still appears in inventory when the native platform source reports it.

## Failure behavior

- Native collector commands are killed after four seconds.
- A failed collector becomes an actionable warning; other surfaces still
  produce a snapshot.
- The snapshot directory rejects symlinks and uses private Unix permissions.
- Snapshot replacement is atomic on Unix. Windows uses a unique temporary file
  and Task Scheduler prevents overlapping automatic runs.
- Uninstalling stops future sampling but intentionally preserves the latest
  snapshot as evidence.

Linux and Windows must complete their platform CI jobs before a release can
claim runtime validation on those systems. Parser and renderer unit tests alone
are not platform evidence.

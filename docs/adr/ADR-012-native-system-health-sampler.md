# ADR-012 — Native System Health Uses OS Schedulers

**Status:** Proposed implementation
**Date:** 2026-08-11
**Implementation:** OpenAI Codex
**Project owner:** Vũ Văn Tâm (`yanacuti1121`)

## Decision

Add a dependency-free `yana-rt os monitor` surface that collects one bounded
CPU, memory, disk, GPU-inventory and Yana-runtime snapshot. Persist only the
latest snapshot under `.yana-ai/os/system-health.json` using a private
directory and atomic replacement.

Automatic sampling uses the operating system's per-user scheduler:

- macOS LaunchAgent;
- Linux systemd user timer and one-shot service;
- Windows Task Scheduler.

Installation is an explicit, one-time human action. Package installation never
silently creates a persistent background job. After installation the native
scheduler samples automatically, so normal use requires no repeated command.

## Why not a custom daemon

ADR-011 rejected a Phase 1 daemon because supervision and platform lifecycle
were unspecified. This design does not add an always-resident Yana supervisor.
It delegates restart, login lifecycle and non-overlap to mature OS schedulers
and runs a bounded one-shot Rust command.

## Telemetry contract

- No prompts, messages, credentials, environment dumps or telemetry uploads.
- Missing platform tools produce explicit unavailable fields and warnings.
- GPU utilization is reported only when a supported provider tool exposes it
  (currently `nvidia-smi`). Inventory-only adapters never fabricate zero usage.
- Native commands have a four-second timeout.
- The minimum automatic interval is 30 seconds on macOS/Linux and 60 seconds
  on Windows.

## Platform notes

- macOS uses `sysctl`, `ps`, `vm_stat`, `df`, and `system_profiler`.
- Linux uses `/proc`, `df`, `nvidia-smi` when present, and DRM sysfs inventory.
- Windows uses PowerShell CIM for CPU/memory/disk/inventory and Task Scheduler.
- NVIDIA metrics use `nvidia-smi` on every supported host where it is present.

Cross-platform code and parser tests do not substitute for real Windows and
Linux runtime evidence. Those platforms must be exercised in CI before the
feature is described as production-validated there.

## Rollback

Run `yana-rt os monitor service uninstall --dir <project>`. The native job is
stopped and its definition removed. The last local snapshot may remain as
read-only evidence and can be deleted separately while the sampler is stopped.

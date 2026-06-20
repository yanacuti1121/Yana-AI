"""TCP port ownership helpers for helper-process lifecycle management.

Origin:  EvanBacon/serve-sim, packages/serve-sim/src/ports.ts (Apache-2.0)
         https://github.com/EvanBacon/serve-sim -- npm package "serve-sim" v0.1.34.
         Provided as a source zip snapshot (no pinned commit SHA available).
Ported:  2026-06-20. Logic is a direct translation. The original shells out
         via `execSync` with a port number interpolated into the command
         string; ported here using `subprocess.run` with an argv list (no
         shell=True) per Yana AI's shell-sanitize-law.md / execution-
         environment.md banned-runtime-function rules, even though the
         original's interpolation was of a `number` (not attacker-controlled
         text) and not actually exploitable.
License: Apache-2.0 (see vendor/serve-sim/_upstream/LICENSE)

Purpose: before starting a dev/helper server on a fixed port, find and kill
whatever stale process is still LISTENing on it -- filtered to LISTEN only
(not arbitrary holders), so killing it doesn't take down unrelated client
sockets (e.g. a browser tab still streaming from a previous run).
"""
from __future__ import annotations

import os
import signal
import subprocess
import time


def get_port_holders(port: int) -> list[int]:
    """Return PIDs currently *listening* on a TCP port (excluding ourselves).

    The LISTEN filter is load-bearing: a bare `lsof -ti tcp:<port>` also lists
    processes holding *client* sockets to the port -- most notably a browser
    streaming from a previous helper. Killing those would abort unrelated
    in-flight connections.
    """
    try:
        result = subprocess.run(
            ["lsof", "-ti", f"tcp:{port}", "-sTCP:LISTEN"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    output = result.stdout.strip()
    if not output:
        return []
    my_pid = os.getpid()
    pids: list[int] = []
    for line in output.splitlines():
        try:
            pid = int(line)
        except ValueError:
            continue
        if pid != my_pid:
            pids.append(pid)
    return pids


def kill_port_holder(port: int) -> None:
    """Kill whatever process is listening on a given port."""
    pids = get_port_holders(port)
    if not pids:
        return
    for pid in pids:
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
    time.sleep(0.1)

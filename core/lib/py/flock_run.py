#!/usr/bin/env python3
"""core/lib/py/flock_run.py — kernel-flock lock-and-run helper (PROTOTYPE).

Not wired into any production hook. Exists to prove the kernel-lock
protocol described in the ABA-safety audit that replaced the mkdir +
stale-reclaim design (docs/adr/ADR-008-shared-locking-infrastructure.md's
generation/rename approach was found to have an unclosable canonical-
pointer race — see that audit for the full analysis).

Contract:
  python3 flock_run.py --lock-file <path> --timeout <seconds> -- <command> [args...]

Absolute invariants this file must never violate:
  - the lock file is created idempotently (O_CREAT, never O_TRUNC) and is
    NEVER unlinked, renamed, or recreated by this script;
  - the lock is held on the file's inode via BSD-style flock() (fcntl.flock
    on Linux/macOS is fd-scoped, not the POSIX fcntl(F_SETLK) process-
    scoped variant — closing an unrelated fd on the same inode elsewhere in
    this process must never release this lock);
  - no staleness heuristic, no reclaim, no generation token, no owner
    token — a crashed holder's lock is released by the kernel tearing down
    its fd table, not by any userspace logic in this file.

Exit codes:
  0        — child ran and exited 0
  <n>      — child ran and exited <n> (n in 1..255), forwarded verbatim
  128+sig  — child was terminated by signal `sig` (POSIX convention)
  2        — this wrapper itself failed: bad arguments, could not open/
             lock the file for a reason other than contention, or timed
             out waiting for the lock. Distinguished from child exit codes
             only by the accompanying stderr message — exit codes 0-255
             are a shared space with the child's own, so callers that need
             an unambiguous "did the wrapper fail vs. did the child fail
             with code 2" signal must check stderr, not just the code.
"""
import argparse
import errno
import fcntl
import os
import signal
import sys
import time

POLL_INTERVAL_SECS = 0.05


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog="flock_run.py",
        description="Acquire a kernel flock on --lock-file, run the command, release on exit.",
    )
    parser.add_argument("--lock-file", required=True, help="Path to the canonical lock file.")
    parser.add_argument("--timeout", required=True, type=float, help="Seconds to wait for the lock before giving up.")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="-- <command> [args...]")
    args = parser.parse_args(argv)

    command = args.command
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        parser.error("no command given after --")
    return args.lock_file, args.timeout, command


def open_lock_file(lock_path):
    # O_CREAT|O_RDWR, never O_TRUNC — truncating on open is unnecessary
    # (the file's content, if any, is irrelevant to flock) and touching
    # content at all is unneeded churn on a file this design promises to
    # never rename/recreate.
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    return fd


def acquire_flock_with_timeout(fd, timeout_secs):
    """Bounded poll loop around flock(LOCK_EX | LOCK_NB).

    flock() itself has no OS-level timeout parameter, so a bounded wait is
    a poll loop — same shape as this repo's existing mkdir-based retry
    loops, just polling a kernel primitive instead of a directory's
    existence.
    """
    deadline = time.monotonic() + timeout_secs
    while True:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except OSError as e:
            if e.errno not in (errno.EACCES, errno.EAGAIN):
                raise
            if time.monotonic() >= deadline:
                return False
            time.sleep(POLL_INTERVAL_SECS)


def run_child_with_signal_forwarding(command):
    """Spawn `command` in its own process group; forward SIGTERM/SIGINT to
    that group; return (returncode, terminating_signal_or_None).
    """
    import subprocess

    proc = subprocess.Popen(command, start_new_session=True)

    forwarded = {"sig": None}

    def _forward(signum, _frame):
        forwarded["sig"] = signum
        try:
            os.killpg(proc.pid, signum)
        except ProcessLookupError:
            pass

    prev_term = signal.signal(signal.SIGTERM, _forward)
    prev_int = signal.signal(signal.SIGINT, _forward)
    try:
        returncode = proc.wait()
    finally:
        signal.signal(signal.SIGTERM, prev_term)
        signal.signal(signal.SIGINT, prev_int)

    return returncode, forwarded["sig"]


def main(argv):
    lock_path, timeout_secs, command = parse_args(argv)

    try:
        fd = open_lock_file(lock_path)
    except OSError as e:
        print(f"flock_run: could not open lock file '{lock_path}': {e}", file=sys.stderr)
        return 2

    try:
        if not acquire_flock_with_timeout(fd, timeout_secs):
            print(
                f"flock_run: timed out acquiring lock '{lock_path}' after {timeout_secs}s",
                file=sys.stderr,
            )
            return 2

        returncode, _forwarding_signal = run_child_with_signal_forwarding(command)

        if returncode < 0:
            # subprocess reports signal termination as a negative returncode
            # (== -signum) on POSIX. Convert to the standard 128+signum
            # shell convention so this wrapper's own exit code is a valid
            # process exit status, not a negative number.
            return 128 + (-returncode)
        return returncode
    finally:
        # Explicit LOCK_UN is redundant with close()'s implicit release
        # (flock is tied to the open file description) but stated
        # explicitly since it documents the release point rather than
        # relying on GC/process-exit timing.
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        except OSError:
            pass
        os.close(fd)
        # NEVER: os.unlink(lock_path) — the absolute invariant this file
        # exists to uphold. Left as an explicit non-action, not merely an
        # omission, so a future edit doesn't "helpfully" add cleanup here.


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

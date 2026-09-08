# flock-v1 locking protocol

`flock-v1` uses a stable regular file at
`.claude/state/locks/<derived-name>.lock`. The file is opened with
`O_CREAT | O_RDWR` and `O_NOFOLLOW`; it is never truncated, renamed,
reclaimed, or unlinked. Kernel ownership ends on close or process death.

## Canonical identity

Callers use a logical `key:` identity such as `key:state/token-budget.json`,
`key:state/tool-sequence.json`, or `key:mission/<id>`. Path resources require
an explicit absolute project root, are normalized lexically without
`realpath`, and may not escape that root. Case is significant. Unicode is
hashed as exact UTF-8 bytes. Rust and Python derive the same ASCII-safe prefix
plus the first four SHA-256 bytes.

## Lifecycle

Python callers hold a native `fcntl.flock` context manager. Rust callers hold
an RAII guard. Bash calls the real compiled `yana-rt guard lock-with`, which
acquires the lock, clears `FD_CLOEXEC` only on the lock descriptor, and then
`exec`s the target with its original argv, environment, cwd, PID, signal, and
exit behavior. A descendant that inherits the descriptor can intentionally
keep the lock alive; wrapped commands must not daemonize.

## Activation and rollback

Production callers require `.claude/state/locking-protocol-version` to contain
exactly `flock-v1`. `.claude/state/locking-maintenance` blocks new flock-v1
launches while old hook processes are quiesced. It cannot block already
installed `mkdir-v1` code, so the operator must first stop launches externally
and prove old processes have exited. The migration helper removes only empty
legacy directories and writes the version marker atomically. It never
recursively deletes lock state or claims to perform portable process proof.

Rollback also starts in maintenance mode. Operators must prove externally
that no process holds a lock FD before removing stable regular lock files.
The helper refuses to remove them because portable FD-holder proof is not
available. Only after the lock root is empty may it remove the protocol marker
and allow the legacy implementation to be restored before reopening launches.

## Runtime resolution

Bash requires a compiled Unix `yana-rt`; it does not use Python or a directory
lock fallback. Resolution accepts `YANA_RT_BIN`, a packaged platform binary,
the source checkout's release/debug binary, or a real compiled binary on
`PATH`. Script shims are rejected by executable magic and failure is closed.

`flock-v1`'s Rust lock-acquisition primitive (`flock_v1::acquire`/`with_lock`,
used by the Capability Lease store, mission store, pending-approval store,
and the token-budget/autonomy state guards) is production-supported on
macOS, Linux, and Windows -- Windows uses
`std::os::windows::fs::OpenOptionsExt::share_mode(0)` (real kernel-exclusive
locking, the same mutual-exclusion property Unix's `flock(2)` gives, not a
best-effort fallback).

The `guard lock-with` CLI subcommand (which holds the lock across
`Command::exec()`, a Unix process-image-replacement primitive) and the
Bash/Python runtime bridges (`core/lib/locking.sh`, `flock_test_helper.py`)
remain Unix-only and retain a clear unsupported-path error rather than
silently selecting another locking protocol.

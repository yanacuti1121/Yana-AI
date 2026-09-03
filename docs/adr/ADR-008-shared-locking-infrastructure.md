# ADR-008: Shared cross-language locking infrastructure

**Status:** Accepted — production protocol `flock-v1`

**Platforms:** macOS, Linux, and Windows (Rust `acquire`/`with_lock` primitive
only -- see the Windows note in Consequences below for what's still Unix-only)

**Supersedes:** `mkdir-v1` directory/rename/stale-reclaim locks

## Context

`risk-scorer`, `budget-sentinel`, and `token-budget-guard` perform concurrent
read-modify-write operations on the same token-budget state from Python,
Bash/Node, and Rust. The former directory-lock protocol used process-local
staleness observations, rename claims, and cleanup. That design admitted
ABA/TOCTOU windows where one process could remove or replace state observed by
another, causing the two 10x/10x hook races to lose updates.

The same protocol also protected intent sequence state and Rust mission
mutations, so replacing only one caller or language would create an unsafe
mixed-protocol deployment.

## Decision

All ADR-008 production callers use `flock-v1`, defined in
`docs/locking-protocol-flock-v1.md`.

- The canonical object is a stable regular file under
  `.claude/state/locks/<derived-name>.lock`.
- Rust uses `libc::flock`; Python uses `fcntl.flock`.
- Bash resolves a real compiled `yana-rt` and invokes
  `guard lock-with`, which acquires and then `exec`s the target.
- The file is opened read/write with create semantics and without truncation.
- No participant renames, reclaims, truncates, or unlinks the canonical file.
- Kernel close/process-death semantics replace stale timers and heartbeats.
- Every caller checks the `flock-v1` protocol marker and maintenance gate.
- Missing runtime, marker mismatch, unsupported platform, and lock failure are
  fail-closed; no caller proceeds unlocked.

## Canonical resources

| Caller | Canonical resource |
| --- | --- |
| `risk-scorer` | `key:state/token-budget.json` |
| `budget-sentinel` | `key:state/token-budget.json` |
| `token-budget-guard` Bash/Node | `key:state/token-budget.json` |
| `token-budget-guard` Rust | `key:state/token-budget.json` |
| `intent-inference` | `key:state/tool-sequence.json` |
| mission mutations | `key:mission/<id>` |
| generic `guard lock-with` | caller-provided key or project-rooted path |

Logical keys are normalized lexically. Path identities require an explicit
absolute project root and may not escape it. Identity bytes, case, Unicode,
and the shared hash/name derivation are specified in the protocol document.

## Runtime surfaces

The in-process Python and Rust APIs remain native to their languages. Bash
does not require Python and has no directory-lock fallback. Source checkouts
resolve a local release/debug runtime; packaged installs use a real platform
binary or `YANA_RT_BIN`. Script shims are rejected.

Windows implements the Rust `flock_v1::acquire`/`with_lock` primitive (via
`share_mode(0)`, real kernel-exclusive locking) -- this is what every real
production caller uses (Capability Lease, mission store, pending-approval
store, token-budget/autonomy state guards). Windows does **not** implement
`guard lock-with` (holds the lock across `Command::exec()`, a Unix
process-image-replacement primitive Windows has no equivalent for) or the
Bash/Python runtime bridges (`core/lib/locking.sh`,
`flock_test_helper.py`) -- those fail clearly rather than silently selecting
a different protocol.

## Atomic activation

The migration is an operational cutover, not a lazy per-caller upgrade:

1. Stop new hook launches outside the repository process itself.
2. Enter `.claude/state/locking-maintenance`.
3. Quiesce and externally verify all old hook/mission processes have exited.
4. Run the migration preflight. Empty legacy lock directories may be removed
   with `rmdir`; non-empty or non-regular residue aborts unchanged.
5. Atomically write `.claude/state/locking-protocol-version` as `flock-v1`.
6. Deploy the Rust, Python, Bash, and mirrored hook callers together.
7. Run smoke, cross-language, and both real 10x/10x race tests.
8. Remove maintenance state and reopen hook launches.

The maintenance file is necessary but cannot stop already-installed old code,
which does not know about it. External launch blocking and process quiescence
are therefore mandatory. The migration helper never recursively deletes lock
state and never claims to prove process quiescence.

## Rollback

Rollback repeats the launch block and quiescence sequence. Operators must
prove that no process holds a flock file descriptor before removing regular
lock files. The helper refuses portable automated deletion of those files.
Only after the lock root is empty may the marker be removed, legacy code be
restored atomically, and launches reopen. A live lock inode is never unlinked.

## Consequences

- Process death releases ownership without a stale timeout.
- Stable-inode discipline removes rename/unlink ABA windows.
- Cross-language callers contend on byte-identical paths.
- A target or descendant that inherits the acquire-to-exec lock descriptor
  can keep the lock alive. Wrapped targets must not daemonize while holding it.
- Production `flock-v1`'s Rust `acquire`/`with_lock` primitive supports
  macOS, Linux, and Windows; `guard lock-with` and the Bash/Python runtime
  bridges remain Unix-only. Unsupported platforms/paths fail closed.
- The Unix arm's stable-inode (TOCTOU/symlink-swap) verification is not
  ported to Windows -- `share_mode(0)` alone gives real mutual exclusion,
  the safety property production callers actually depend on, but the
  narrower symlink-swap defense stays a documented Unix-only hardening pass.

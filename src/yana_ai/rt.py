"""
yana-rt Python entry point.

Resolution order:
  1. $YANA_RT_BIN env var
  2. yana-rt on $PATH — but NEVER this wrapper itself
  3. Pre-built binary shipped with package (bin/yana-rt-<platform>-<arch>)
  4. Locally built: target/release/yana-rt (cargo build --release)

RECURSION GUARD (2026-07-25): pip's console_scripts entry point installs a
shim also named `yana-rt` on $PATH. `shutil.which("yana-rt")` then found
that same shim, and subprocess.run() re-invoked it — unbounded recursion,
the same bug class fixed in scripts/yana-rt-wrapper.js on 2026-07-08/09
(100% CPU, 116°C incident) but never ported to this file until now. This
mirrors that fix: a hard re-entry guard env var, plus a realpath self-check
on every candidate (not just the $PATH one) so $YANA_RT_BIN can't re-arm it.

VERSION COMPATIBILITY CHECK (2026-08-11): this wrapper is a pure passthrough
— it forwards argv to whichever `yana-rt` binary it resolves and has no
subcommand/flag-specific logic of its own, so a stale binary doesn't break
THIS file. It can still confuse a user, though: a `yana-rt` older than what
`yana-ai`'s own docs/README describe (or picked up from an unrelated older
install on $PATH/$YANA_RT_BIN) will reject subcommands as "unrecognized" for
reasons that have nothing to do with the actual command the user typed —
exactly the class of stale-binary confusion already documented in this
repo's `core/rules/71-entry-point-verify-law.md` and its
`entry-point-verify-reminder.sh` test fixture. A version check here is
advisory only (warn, never block): passthrough has no evidenced dependency
on any specific `yana-rt` version today, so refusing to run an old-but-
still-working binary would be a new failure mode invented ahead of real
need. See VERSIONING.md's "Compatibility across axes" section.
"""
import os
import re
import sys
import platform
import subprocess
from pathlib import Path

_PKG_ROOT = Path(__file__).parent.parent.parent  # src/yana_ai/rt.py → repo root
_RECURSION_GUARD = "YANA_RT_WRAPPER_ACTIVE"
_SELF_REALPATH = str(Path(__file__).resolve())

# Floor below which a resolved yana-rt binary is old enough to plausibly be
# missing a subcommand this yana-ai release's docs describe. Bump this only
# when a yana-rt release makes a CLI-surface change this wrapper's users
# would actually notice — not on every crate patch release.
_MIN_YANA_RT_VERSION = (1, 0, 0)
_VERSION_RE = re.compile(r"(\d+)\.(\d+)\.(\d+)")


def _check_version_compat(binary: str) -> None:
    """Best-effort, non-blocking: warn (stderr) if the resolved binary
    reports a version below _MIN_YANA_RT_VERSION. Any failure here (binary
    doesn't support --version, times out, unparseable output) is silently
    ignored — this is an advisory signal, not a requirement, and must never
    be the reason a working setup stops working."""
    try:
        result = subprocess.run(
            [binary, "--version"], capture_output=True, text=True, timeout=5
        )
        match = _VERSION_RE.search(result.stdout)
        if not match:
            return
        found = tuple(int(part) for part in match.groups())
        if found < _MIN_YANA_RT_VERSION:
            min_str = ".".join(str(p) for p in _MIN_YANA_RT_VERSION)
            found_str = ".".join(str(p) for p in found)
            print(
                f"yana-rt: warning — resolved binary reports version {found_str}, "
                f"older than {min_str}. Some subcommands this yana-ai release's "
                "docs describe may not exist in it. Run `cargo install yana-rt` "
                "to upgrade, or set $YANA_RT_BIN to a newer build.",
                file=sys.stderr,
            )
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return


def _platform_bin() -> Path:
    plat = sys.platform  # linux, darwin, win32
    arch = platform.machine().lower()
    if arch in ("amd64", "x86_64"):
        arch = "x86_64"
    ext = ".exe" if plat == "win32" else ""
    return _PKG_ROOT / "bin" / f"yana-rt-{plat}-{arch}{ext}"


def _usable(candidate: str | None) -> bool:
    """A candidate is usable only if it exists, is executable, and its
    realpath does not resolve back to this wrapper file itself."""
    if not candidate:
        return False
    p = Path(candidate)
    if not p.exists() or not os.access(p, os.X_OK):
        return False
    try:
        real = str(p.resolve())
    except (OSError, RuntimeError):
        # RuntimeError: Path.resolve() raises this on an infinite symlink
        # loop. Either way, unresolvable -> fail closed, not open.
        return False
    return real != _SELF_REALPATH


def _find_binary() -> str | None:
    # 1. Explicit override — self-checked too, so `which yana-rt` (this
    #    shim) pasted into YANA_RT_BIN can't re-arm the recursion.
    override = os.environ.get("YANA_RT_BIN")
    if override and _usable(override):
        return override

    # 2. System PATH
    import shutil
    on_path = shutil.which("yana-rt")
    if on_path and _usable(on_path):
        return on_path

    # 3. Pre-built platform binary
    pb = _platform_bin()
    if _usable(str(pb)):
        return str(pb)

    # 4. Local cargo build
    local = _PKG_ROOT / "target" / "release" / "yana-rt"
    if _usable(str(local)):
        return str(local)

    return None


def _run(extra_args: list[str] | None = None) -> None:
    # Hard re-entry guard: if we're here twice, some candidate led back to
    # this wrapper. Abort rather than "try the next candidate" — the
    # parent process already made its choice.
    if os.environ.get(_RECURSION_GUARD):
        print(
            "yana-rt: recursion detected — the wrapper was re-entered by a "
            "child it spawned.\nA candidate (likely $YANA_RT_BIN or a $PATH "
            "shim) resolves back to this wrapper.\nUnset YANA_RT_BIN, or "
            "point it at a real compiled binary (e.g. ~/.cargo/bin/yana-rt).",
            file=sys.stderr,
        )
        sys.exit(1)

    binary = _find_binary()
    if binary is None:
        print(
            "yana-rt: binary not found.\n\n"
            "To install, run one of:\n"
            f"  cargo install --path {_PKG_ROOT}  # build from source (requires Rust)\n"
            "  export YANA_RT_BIN=/path/to/yana-rt\n\n"
            "Do NOT set YANA_RT_BIN to the output of `which yana-rt` — on a\n"
            "pip install that path is this wrapper itself, not a compiled binary.",
            file=sys.stderr,
        )
        sys.exit(1)

    _check_version_compat(binary)

    env = {**os.environ, _RECURSION_GUARD: "1"}
    result = subprocess.run([binary] + (extra_args or []) + sys.argv[1:], env=env)
    sys.exit(result.returncode)


def main() -> None:
    _run()


def chat_main() -> None:
    """Launch the local chat workspace through the packaged Rust runtime."""
    _run(["chat"])


if __name__ == "__main__":
    main()

"""Public entrypoint: argv -> resolved, allowlist-checked exec decision.

Origin:  openclaw/openclaw @ 4799fe7df6c46f3911ecc4db9117bfc329eb4f34
         src/infra/exec-approvals-analysis.ts (analyzeArgvCommand) (MIT)
Ported:  2026-06-19. `analyze_argv_command` is a direct translation. The
         Windows-only `buildEnforcedShellCommand`/`renderWindowsQuotedArgv`
         re-execution-quoting helpers were cut along with the rest of this
         port's Windows surface (see dispatch_wrapper_resolution.py,
         shell_wrapper_resolution.py docstrings).
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: this is the one function Yana-AI's own gate scripts should call.
It wraps the full chain — wrapper unwrapping, executable/path trust
resolution, and (optionally) allowlist matching — behind a single call so
`core/scripts/safe-run.sh` or a PreToolUse hook does not need to know about
dispatch wrappers, shell multiplexers, or realpath trust resolution
internals to ask "is this argv allowed, and what does it actually run?"
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .exec_command_resolution import (
    CommandResolution,
    ExecAllowlistEntry,
    match_allowlist,
    resolve_command_resolution_from_argv,
)


@dataclass
class ExecCommandSegment:
    raw: str
    argv: list[str]
    resolution: CommandResolution | None
    source_argv: list[str] | None = None


@dataclass
class ExecCommandAnalysis:
    ok: bool
    segments: list[ExecCommandSegment] = field(default_factory=list)
    reason: str | None = None


def analyze_argv_command(
    argv: list[str], *, cwd: str | None = None, env: dict | None = None
) -> ExecCommandAnalysis:
    """Resolve a single argv command through the wrapper-unwrap + trust pipeline."""
    filtered = [entry for entry in argv if entry.strip()]
    if not filtered:
        return ExecCommandAnalysis(ok=False, reason="empty argv")
    resolution = resolve_command_resolution_from_argv(filtered, cwd, env)
    segment = ExecCommandSegment(raw=" ".join(filtered), argv=filtered, source_argv=list(argv), resolution=resolution)
    return ExecCommandAnalysis(ok=True, segments=[segment])


def is_command_allowed(
    argv: list[str],
    allowlist: list[ExecAllowlistEntry],
    *,
    cwd: str | None = None,
    env: dict | None = None,
) -> tuple[bool, str | None]:
    """Convenience wrapper: is this argv covered by the allowlist?

    Returns (allowed, blocked_wrapper). `blocked_wrapper` is set when an
    opaque/untrusted wrapper (e.g. `sudo`, `doas`, an interactive shell `-i`)
    short-circuited resolution before an allowlist check was even possible —
    that case is always a deny, independent of the allowlist contents.
    """
    analysis = analyze_argv_command(argv, cwd=cwd, env=env)
    if not analysis.ok or not analysis.segments:
        return (False, None)
    resolution = analysis.segments[0].resolution
    if resolution is None:
        return (False, None)
    if resolution.policy_blocked:
        return (False, resolution.blocked_wrapper)
    entry = match_allowlist(allowlist, resolution.execution, analysis.segments[0].argv)
    return (entry is not None, None)

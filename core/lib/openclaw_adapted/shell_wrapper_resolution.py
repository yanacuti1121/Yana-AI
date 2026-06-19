"""POSIX shell-wrapper (`sh -c`, `bash -lc`, busybox applet) unwrapping — port.

Origin:  openclaw/openclaw @ 4799fe7df6c46f3911ecc4db9117bfc329eb4f34
         src/infra/shell-wrapper-resolution.ts (MIT License)
Ported:  2026-06-19. Adapted: the `cmd`/`powershell`/`pwsh` Windows shell
         branches were cut, matching the PowerShell cut in
         shell_inline_command.py — Yana-AI has no Windows surface to gate.
         The POSIX shell and busybox/toybox multiplexer logic is a direct
         translation, including the dispatch-wrapper-recursion guard
         (resolve_shell_wrapper_candidate) that lets `nice bash -c "..."`
         still resolve to the inline command behind both layers.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: unwraps `sh`/`bash`/`zsh`/`fish`/... wrapper invocations down to the
inline command they actually execute, so the exec-approval gate can inspect
the real command text rather than approving "bash" as if it were the whole
risk surface. Fails closed (`is_wrapper=True, command=None`) when a startup
flag (interactive/login/fish `-C`) could run arbitrary code before the
inline payload — that case must not be silently rebound to "just the
payload".
"""
from __future__ import annotations

from dataclasses import dataclass

from .dispatch_wrapper_resolution import (
    MAX_DISPATCH_WRAPPER_DEPTH,
    has_dispatch_env_manipulation,
    unwrap_known_dispatch_wrapper_invocation,
)
from .shell_inline_command import (
    POSIX_INLINE_COMMAND_FLAGS,
    has_fish_attached_command_option,
    has_fish_init_command_option,
    has_posix_interactive_startup_before_inline_command,
    has_posix_login_startup_before_inline_command,
    resolve_inline_command_match,
)
from .tokens import normalize_executable_token

POSIX_SHELL_WRAPPERS = frozenset({"ash", "bash", "dash", "fish", "ksh", "sh", "zsh"})
_SHELL_MULTIPLEXER_WRAPPERS = frozenset({"busybox", "toybox"})
_LOGIN_STARTUP_SHELL_WRAPPERS = POSIX_SHELL_WRAPPERS


def is_shell_wrapper_executable(token: str) -> bool:
    return normalize_executable_token(token) in POSIX_SHELL_WRAPPERS


@dataclass
class _ShellWrapperCandidate:
    argv: list[str]
    token0: str
    state: bool


def _resolve_shell_wrapper_candidate(
    argv: list[str], depth: int, state: bool = False, on_dispatch_unwrap=None
) -> _ShellWrapperCandidate | None:
    if depth > MAX_DISPATCH_WRAPPER_DEPTH:
        return None
    token0 = (argv[0] or "").strip() if argv else ""
    if not token0:
        return None

    dispatch_unwrap = unwrap_known_dispatch_wrapper_invocation(argv)
    if dispatch_unwrap.kind == "blocked":
        return None
    if dispatch_unwrap.kind == "unwrapped":
        new_state = on_dispatch_unwrap(state, argv) if on_dispatch_unwrap else state
        return _resolve_shell_wrapper_candidate(dispatch_unwrap.argv, depth + 1, new_state, on_dispatch_unwrap)

    multiplexer_unwrap = unwrap_known_shell_multiplexer_invocation(argv)
    if multiplexer_unwrap[0] == "blocked":
        return None
    if multiplexer_unwrap[0] == "unwrapped":
        return _resolve_shell_wrapper_candidate(multiplexer_unwrap[2], depth + 1, state, on_dispatch_unwrap)

    return _ShellWrapperCandidate(argv=argv, token0=token0, state=state)


def unwrap_known_shell_multiplexer_invocation(argv: list[str]) -> tuple[str, str | None, list[str] | None]:
    """Unwrap busybox/toybox shell applets, or fail closed for ambiguous ones.

    Returns (kind, wrapper, argv) where kind is "not-wrapper" | "blocked" | "unwrapped".
    """
    token0 = (argv[0] or "").strip() if argv else ""
    if not token0:
        return ("not-wrapper", None, None)
    wrapper = normalize_executable_token(token0)
    if wrapper not in _SHELL_MULTIPLEXER_WRAPPERS:
        return ("not-wrapper", None, None)

    applet_index = 1
    if len(argv) > applet_index and (argv[applet_index] or "").strip() == "--":
        applet_index += 1
    applet = (argv[applet_index] or "").strip() if applet_index < len(argv) else None
    if not applet or not is_shell_wrapper_executable(applet):
        return ("blocked", wrapper, None)

    unwrapped = argv[applet_index:]
    if not unwrapped:
        return ("blocked", wrapper, None)
    return ("unwrapped", wrapper, unwrapped)


def _is_legacy_sh_login_inline_form(argv: list[str], base_executable: str) -> bool:
    return base_executable == "sh" and len(argv) > 1 and (argv[1] or "").strip() == "-lc"


def _startup_wrapper_requires_full_argv(
    argv: list[str], base_executable: str, *, include_legacy_login_inline_form: bool
) -> bool:
    if base_executable == "fish" and has_fish_init_command_option(argv):
        return True
    if base_executable in _LOGIN_STARTUP_SHELL_WRAPPERS and has_posix_login_startup_before_inline_command(
        argv, POSIX_INLINE_COMMAND_FLAGS
    ):
        return include_legacy_login_inline_form or not _is_legacy_sh_login_inline_form(argv, base_executable)
    return has_posix_interactive_startup_before_inline_command(argv, POSIX_INLINE_COMMAND_FLAGS)


def extract_bindable_shell_wrapper_inline_command(argv: list[str], raw_command: str | None = None) -> str | None:
    """Extract a command payload only when safe to bind to raw command text."""
    return extract_shell_wrapper_command(argv, raw_command)[1]


def extract_shell_wrapper_command(
    argv: list[str], raw_command: str | None = None, depth: int = 0
) -> tuple[bool, str | None]:
    """Classify shell wrapper argv. Returns (is_wrapper, command)."""
    candidate = _resolve_shell_wrapper_candidate(argv, depth)
    if not candidate:
        return (False, None)

    base_executable = normalize_executable_token(candidate.token0)
    if base_executable not in POSIX_SHELL_WRAPPERS:
        return (False, None)
    payload, _ = resolve_inline_command_match(candidate.argv, POSIX_INLINE_COMMAND_FLAGS, allow_combined_c=True)
    if not payload:
        return (False, None)
    if base_executable == "fish" and has_fish_attached_command_option(candidate.argv):
        return (True, None)

    raw_trimmed = (raw_command or "").strip() or None
    canonical_argv = " ".join(candidate.argv)
    raw_matches_payload = raw_trimmed == payload
    raw_matches_canonical_argv = raw_trimmed == canonical_argv
    allow_legacy_sh_login_binding = _is_legacy_sh_login_inline_form(candidate.argv, base_executable) and (
        raw_matches_payload or raw_matches_canonical_argv
    )
    if _startup_wrapper_requires_full_argv(
        candidate.argv, base_executable, include_legacy_login_inline_form=not allow_legacy_sh_login_binding
    ):
        return (True, None)

    command = payload if raw_matches_canonical_argv else (raw_trimmed or payload)
    return (True, command)


def has_env_manipulation_before_shell_wrapper(argv: list[str], depth: int = 0, env_seen: bool = False) -> bool:
    def on_dispatch_unwrap(state: bool, wrapped_argv: list[str]) -> bool:
        return state or has_dispatch_env_manipulation(wrapped_argv)

    candidate = _resolve_shell_wrapper_candidate(argv, depth, env_seen, on_dispatch_unwrap)
    if not candidate:
        return False
    base_executable = normalize_executable_token(candidate.token0)
    if base_executable not in POSIX_SHELL_WRAPPERS:
        return False
    payload, _ = resolve_inline_command_match(candidate.argv, POSIX_INLINE_COMMAND_FLAGS, allow_combined_c=True)
    if not payload:
        return False
    return candidate.state

"""Transparent dispatch-wrapper (nice/timeout/flock/env/sudo/...) unwrapping.

Origin:  openclaw/openclaw @ 4799fe7df6c46f3911ecc4db9117bfc329eb4f34
         src/infra/dispatch-wrapper-resolution.ts (MIT License)
Ported:  2026-06-19. Direct translation of the wrapper-spec table and the
         generic option-scanning state machine for the cross-platform
         wrappers. Four macOS/BSD-only specs (`arch`, `sandbox-exec`,
         `script`, `xcrun`) were intentionally cut — they are Darwin-gated
         in the original and Yana-AI's host is Linux/Codespaces; their
         absence here means those four executable names simply fall through
         to "not-wrapper" (treated as an ordinary command) rather than being
         transparently unwrapped or policy-blocked.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: a process can be wrapped in zero-cost dispatch helpers (`nice -n5
real-cmd`, `timeout 30 real-cmd`, `env FOO=bar real-cmd`) that don't change
what actually runs. This module unwraps a known, transparent-usage wrapper
chain down to the real command so the allowlist/approval gate inspects the
real target — and *fails closed* (blocks) on wrappers it cannot prove are
being used transparently (e.g. `sudo`, `doas`, `setsid`, or `env` with
modifiers), rather than silently trusting an opaque chain.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable

from .command_carriers import env_invocation_uses_modifiers, unwrap_env_invocation
from .tokens import normalize_executable_token, parse_inline_option_token

MAX_DISPATCH_WRAPPER_DEPTH = 4

_NICE_OPTIONS_WITH_VALUE = frozenset({"-n", "--adjustment", "--priority"})
_CAFFEINATE_OPTIONS_WITH_VALUE = frozenset({"-t", "-w"})
_STDBUF_OPTIONS_WITH_VALUE = frozenset({"-i", "--input", "-o", "--output", "-e", "--error"})
_FLOCK_SHORT_FLAG_OPTIONS = frozenset({"-e", "-F", "-n", "-o", "-s", "-x"})
_FLOCK_LONG_FLAG_OPTIONS = frozenset(
    {"--close", "--exclusive", "--nb", "--no-fork", "--nonblock", "--shared", "--verbose"}
)
_FLOCK_SHORT_OPTIONS_WITH_VALUE = frozenset({"-E", "-w"})
_FLOCK_LONG_OPTIONS_WITH_VALUE = frozenset({"--conflict-exit-code", "--timeout", "--wait"})
_TIME_FLAG_OPTIONS = frozenset(
    {"-a", "--append", "-h", "--help", "-l", "-p", "-q", "--quiet", "-v", "--verbose", "-V", "--version"}
)
_TIME_OPTIONS_WITH_VALUE = frozenset({"-f", "--format", "-o", "--output"})
_TIMEOUT_FLAG_OPTIONS = frozenset({"--foreground", "--preserve-status", "-v", "--verbose"})
_TIMEOUT_OPTIONS_WITH_VALUE = frozenset({"-k", "--kill-after", "-s", "--signal"})


def _scan_wrapper_invocation(
    argv: list[str],
    on_token: Callable[[str, str], str],
    *,
    separators: frozenset[str] = frozenset(),
    adjust_command_index: Callable[[int, list[str]], int | None] | None = None,
) -> list[str] | None:
    idx = 1
    expects_option_value = False
    n = len(argv)
    while idx < n:
        token = (argv[idx] or "").strip()
        if not token:
            idx += 1
            continue
        if expects_option_value:
            expects_option_value = False
            idx += 1
            continue
        if token in separators:
            idx += 1
            break
        directive = on_token(token, token.lower())
        if directive == "stop":
            break
        if directive == "invalid":
            return None
        if directive == "consume-next":
            expects_option_value = True
        idx += 1
    if expects_option_value:
        return None
    command_index = adjust_command_index(idx, argv) if adjust_command_index else idx
    if command_index is None or command_index >= n:
        return None
    return argv[command_index:]


def _unwrap_dash_option_invocation(
    argv: list[str],
    on_flag: Callable[[str, str], str],
    adjust_command_index: Callable[[int, list[str]], int | None] | None = None,
) -> list[str] | None:
    def on_token(token: str, lower: str) -> str:
        if not token.startswith("-") or token == "-":
            return "stop"
        flag = parse_inline_option_token(lower).name
        return on_flag(flag, lower)

    return _scan_wrapper_invocation(argv, on_token, separators=frozenset({"--"}),
                                     adjust_command_index=adjust_command_index)


_NICE_NEGATIVE_NUMBER_RE = re.compile(r"^-\d+$")


def _unwrap_nice_invocation(argv: list[str]) -> list[str] | None:
    def on_flag(flag: str, lower: str) -> str:
        if _NICE_NEGATIVE_NUMBER_RE.match(lower):
            return "continue"
        if flag in _NICE_OPTIONS_WITH_VALUE:
            return "continue" if ("=" in lower or lower != flag) else "consume-next"
        if lower.startswith("-n") and len(lower) > 2:
            return "continue"
        return "invalid"

    return _unwrap_dash_option_invocation(argv, on_flag)


def _unwrap_caffeinate_invocation(argv: list[str]) -> list[str] | None:
    def on_flag(flag: str, lower: str) -> str:
        if flag in ("-d", "-i", "-m", "-s", "-u"):
            return "continue"
        if flag in _CAFFEINATE_OPTIONS_WITH_VALUE:
            return "continue" if (lower != flag or "=" in lower) else "consume-next"
        return "invalid"

    return _unwrap_dash_option_invocation(argv, on_flag)


def _unwrap_nohup_invocation(argv: list[str]) -> list[str] | None:
    def on_token(_token: str, lower: str) -> str:
        return "continue" if lower in ("--help", "--version") else "invalid"

    def gate(token: str, lower: str) -> str:
        if not token.startswith("-") or token == "-":
            return "stop"
        return on_token(token, lower)

    return _scan_wrapper_invocation(argv, gate, separators=frozenset({"--"}))


def _unwrap_stdbuf_invocation(argv: list[str]) -> list[str] | None:
    def on_flag(flag: str, lower: str) -> str:
        if flag not in _STDBUF_OPTIONS_WITH_VALUE:
            return "invalid"
        return "continue" if "=" in lower else "consume-next"

    return _unwrap_dash_option_invocation(argv, on_flag)


def _unwrap_time_invocation(argv: list[str]) -> list[str] | None:
    def on_flag(flag: str, lower: str) -> str:
        if flag in _TIME_FLAG_OPTIONS:
            return "continue"
        if flag in _TIME_OPTIONS_WITH_VALUE:
            return "continue" if "=" in lower else "consume-next"
        return "invalid"

    return _unwrap_dash_option_invocation(argv, on_flag)


def _is_flock_short_flag_cluster(token: str) -> bool:
    return bool(token) and token[0] == "-" and all(c in "eFnsxo" for c in token[1:]) and len(token) > 1


def _unwrap_flock_invocation(argv: list[str]) -> list[str] | None:
    def on_token(token: str, lower: str) -> str:
        if not token.startswith("-") or token == "-":
            return "stop"
        parsed_name = parse_inline_option_token(token).name
        lower_flag = parse_inline_option_token(lower).name
        if lower_flag in _FLOCK_LONG_FLAG_OPTIONS:
            return "continue"
        if lower_flag in _FLOCK_LONG_OPTIONS_WITH_VALUE:
            return "continue" if parse_inline_option_token(token).has_inline_value else "consume-next"
        if _is_flock_short_flag_cluster(token):
            return "continue"
        if parsed_name in _FLOCK_SHORT_FLAG_OPTIONS:
            return "continue"
        if parsed_name in _FLOCK_SHORT_OPTIONS_WITH_VALUE:
            has_inline = parse_inline_option_token(token).has_inline_value
            return "continue" if (has_inline or token != parsed_name) else "consume-next"
        return "invalid"

    def adjust(command_index: int, current_argv: list[str]) -> int | None:
        wrapped_index = command_index + 1
        wrapped = (current_argv[wrapped_index] or "").strip() if wrapped_index < len(current_argv) else ""
        return wrapped_index if wrapped and (not wrapped.startswith("-") or wrapped == "-") else None

    return _scan_wrapper_invocation(argv, on_token, separators=frozenset({"--"}), adjust_command_index=adjust)


def _time_invocation_writes_output_file(argv: list[str]) -> bool:
    expects_value = False
    for idx in range(1, len(argv)):
        token = (argv[idx] or "").strip()
        if not token:
            continue
        if expects_value:
            expects_value = False
            continue
        if token == "--" or not token.startswith("-") or token == "-":
            return False
        lower = token.lower()
        flag = parse_inline_option_token(lower).name
        if flag in ("-o", "--output"):
            return True
        if flag in _TIME_OPTIONS_WITH_VALUE and "=" not in lower:
            expects_value = True
    return False


def _unwrap_timeout_invocation(argv: list[str]) -> list[str] | None:
    def on_flag(flag: str, lower: str) -> str:
        if flag in _TIMEOUT_FLAG_OPTIONS:
            return "continue"
        if flag in _TIMEOUT_OPTIONS_WITH_VALUE:
            return "continue" if "=" in lower else "consume-next"
        return "invalid"

    def adjust(command_index: int, current_argv: list[str]) -> int | None:
        wrapped_index = command_index + 1
        return wrapped_index if wrapped_index < len(current_argv) else None

    return _unwrap_dash_option_invocation(argv, on_flag, adjust)


@dataclass(frozen=True)
class _DispatchWrapperSpec:
    name: str
    unwrap: Callable[[list[str]], list[str] | None] | None = None
    transparent_usage: bool | Callable[[list[str]], bool] = False


_DISPATCH_WRAPPER_SPECS: tuple[_DispatchWrapperSpec, ...] = (
    _DispatchWrapperSpec("caffeinate", _unwrap_caffeinate_invocation, True),
    _DispatchWrapperSpec("chrt"),
    _DispatchWrapperSpec("doas"),
    _DispatchWrapperSpec("env", unwrap_env_invocation, lambda argv: not env_invocation_uses_modifiers(argv)),
    _DispatchWrapperSpec("flock", _unwrap_flock_invocation, True),
    _DispatchWrapperSpec("ionice"),
    _DispatchWrapperSpec("nice", _unwrap_nice_invocation, True),
    _DispatchWrapperSpec("nohup", _unwrap_nohup_invocation, True),
    _DispatchWrapperSpec("setsid"),
    _DispatchWrapperSpec("stdbuf", _unwrap_stdbuf_invocation, True),
    _DispatchWrapperSpec("sudo"),
    _DispatchWrapperSpec("taskset"),
    _DispatchWrapperSpec("time", _unwrap_time_invocation, lambda argv: not _time_invocation_writes_output_file(argv)),
    _DispatchWrapperSpec("timeout", _unwrap_timeout_invocation, True),
)
_SPEC_BY_NAME = {spec.name: spec for spec in _DISPATCH_WRAPPER_SPECS}


def is_dispatch_wrapper_executable(token: str) -> bool:
    return normalize_executable_token(token) in _SPEC_BY_NAME


@dataclass(frozen=True)
class _DispatchUnwrapResult:
    kind: str  # "not-wrapper" | "blocked" | "unwrapped"
    wrapper: str | None = None
    argv: list[str] | None = None


def unwrap_known_dispatch_wrapper_invocation(argv: list[str]) -> _DispatchUnwrapResult:
    token0 = (argv[0] or "").strip() if argv else ""
    if not token0:
        return _DispatchUnwrapResult(kind="not-wrapper")
    wrapper = normalize_executable_token(token0)
    spec = _SPEC_BY_NAME.get(wrapper)
    if not spec:
        return _DispatchUnwrapResult(kind="not-wrapper")
    if not spec.unwrap:
        return _DispatchUnwrapResult(kind="blocked", wrapper=wrapper)
    unwrapped = spec.unwrap(argv)
    if unwrapped:
        return _DispatchUnwrapResult(kind="unwrapped", wrapper=wrapper, argv=unwrapped)
    return _DispatchUnwrapResult(kind="blocked", wrapper=wrapper)


def _is_semantic_dispatch_wrapper_usage(wrapper: str, argv: list[str]) -> bool:
    spec = _SPEC_BY_NAME.get(wrapper)
    if not spec or not spec.unwrap:
        return True
    transparent = spec.transparent_usage
    if callable(transparent):
        return not transparent(argv)
    return transparent is not True


@dataclass
class DispatchWrapperTrustPlan:
    argv: list[str]
    wrappers: list[str] = field(default_factory=list)
    policy_blocked: bool = False
    blocked_wrapper: str | None = None


def resolve_dispatch_wrapper_trust_plan(
    argv: list[str], max_depth: int = MAX_DISPATCH_WRAPPER_DEPTH
) -> DispatchWrapperTrustPlan:
    current = argv
    wrappers: list[str] = []
    for _ in range(max_depth):
        unwrap = unwrap_known_dispatch_wrapper_invocation(current)
        if unwrap.kind == "blocked":
            return DispatchWrapperTrustPlan(current, wrappers, True, unwrap.wrapper)
        if unwrap.kind != "unwrapped" or not unwrap.argv:
            break
        wrappers.append(unwrap.wrapper)
        if _is_semantic_dispatch_wrapper_usage(unwrap.wrapper, current):
            return DispatchWrapperTrustPlan(current, wrappers, True, unwrap.wrapper)
        current = unwrap.argv
    if len(wrappers) >= max_depth:
        overflow = unwrap_known_dispatch_wrapper_invocation(current)
        if overflow.kind in ("blocked", "unwrapped"):
            return DispatchWrapperTrustPlan(current, wrappers, True, overflow.wrapper)
    return DispatchWrapperTrustPlan(current, wrappers, False)


def has_dispatch_env_manipulation(argv: list[str]) -> bool:
    unwrap = unwrap_known_dispatch_wrapper_invocation(argv)
    return unwrap.kind == "unwrapped" and unwrap.wrapper == "env" and env_invocation_uses_modifiers(argv)

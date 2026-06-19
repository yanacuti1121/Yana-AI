"""Executable-name and CLI-option tokenizing primitives — port.

Origin:  openclaw/openclaw @ 4799fe7df6c46f3911ecc4db9117bfc329eb4f34
         src/infra/exec-wrapper-tokens.ts, src/infra/inline-option-token.ts,
         src/infra/exec-argv-analysis.ts (MIT License)
Ported:  2026-06-19. Direct translation; the only behavioral change is
         dropping the Windows PATHEXT-suffix stripping special case in
         normalize_executable_token's TS source comment about case folding,
         which is preserved here unchanged (still platform-agnostic safe).
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: shared building blocks for the exec-approval gate — normalizing an
executable token to compare against allowlist/wrapper names, and parsing a
single argv token into a structured option/positional shape so wrapper
unwrapping (dispatch_wrapper_resolution, shell_wrapper_resolution) can reason
about argv without re-parsing strings ad hoc.
"""
from __future__ import annotations

import ntpath
import posixpath
from dataclasses import dataclass

_WINDOWS_EXECUTABLE_SUFFIXES = (".exe", ".cmd", ".bat", ".com")


def _strip_windows_executable_suffix(value: str) -> str:
    for suffix in _WINDOWS_EXECUTABLE_SUFFIXES:
        if value.endswith(suffix):
            return value[: -len(suffix)]
    return value


def basename_lower(token: str) -> str:
    """Lowercase basename using the shorter of POSIX/Windows interpretation."""
    win = ntpath.basename(token)
    posix = posixpath.basename(token)
    base = win if len(win) < len(posix) else posix
    return base.lower() if base else ""


def normalize_executable_token(token: str) -> str:
    """Normalize an executable token for wrapper and policy matching."""
    return _strip_windows_executable_suffix(basename_lower(token))


@dataclass(frozen=True)
class InlineOptionToken:
    name: str
    has_inline_value: bool
    inline_value: str | None = None


def parse_inline_option_token(token: str) -> InlineOptionToken:
    """Split one CLI-style option token into flag name and optional `=value`."""
    separator_index = token.find("=")
    if separator_index < 0:
        return InlineOptionToken(name=token, has_inline_value=False)
    return InlineOptionToken(
        name=token[:separator_index],
        has_inline_value=True,
        inline_value=token[separator_index + 1 :],
    )


@dataclass(frozen=True)
class ExecArgvToken:
    kind: str  # "empty" | "terminator" | "stdin" | "positional" | "option"
    raw: str
    style: str | None = None  # "long" | "short-cluster"
    flag: str | None = None
    inline_value: str | None = None
    cluster: str | None = None
    flags: tuple[str, ...] | None = None


def parse_exec_argv_token(raw: str) -> ExecArgvToken:
    """Tokenize a single argv entry into a normalized option/positional model."""
    if not raw:
        return ExecArgvToken(kind="empty", raw=raw)
    if raw == "--":
        return ExecArgvToken(kind="terminator", raw=raw)
    if raw == "-":
        return ExecArgvToken(kind="stdin", raw=raw)
    if not raw.startswith("-"):
        return ExecArgvToken(kind="positional", raw=raw)
    if raw.startswith("--"):
        eq_index = raw.find("=")
        if eq_index > 0:
            return ExecArgvToken(
                kind="option",
                raw=raw,
                style="long",
                flag=raw[:eq_index],
                inline_value=raw[eq_index + 1 :],
            )
        return ExecArgvToken(kind="option", raw=raw, style="long", flag=raw)
    cluster = raw[1:]
    return ExecArgvToken(
        kind="option",
        raw=raw,
        style="short-cluster",
        cluster=cluster,
        flags=tuple(f"-{c}" for c in cluster),
    )

"""Lightweight glob pattern compiling and matching — port.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/agents/glob-pattern.ts (MIT)
Ported:  2026-06-25, for the context-pruning subsystem port.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Used by agent policies (e.g. context-pruning tool allow/deny lists) to match
a value against a small set of "*"-wildcard patterns without pulling in a
full glob library.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Sequence

_REGEX_METACHARACTERS = re.compile(r"[.*+?^${}()|\[\]\\]")


@dataclass(frozen=True)
class CompiledGlobPattern:
    """A pre-compiled glob pattern: kind is "all", "exact", or "regex"."""

    kind: str
    value: str | re.Pattern[str] | None = None


def _escape_regex(value: str) -> str:
    """Escape string for use as a regex literal."""
    return _REGEX_METACHARACTERS.sub(lambda m: "\\" + m.group(0), value)


def _compile_glob_pattern(
    raw: str, normalize: Callable[[str], str]
) -> CompiledGlobPattern:
    normalized = normalize(raw)
    if not normalized:
        return CompiledGlobPattern(kind="exact", value="")
    if normalized == "*":
        return CompiledGlobPattern(kind="all")
    if "*" not in normalized:
        return CompiledGlobPattern(kind="exact", value=normalized)
    escaped = _escape_regex(normalized).replace("\\*", ".*")
    return CompiledGlobPattern(kind="regex", value=re.compile(f"^{escaped}$"))


def compile_glob_patterns(
    raw: Sequence[str] | None, normalize: Callable[[str], str]
) -> list[CompiledGlobPattern]:
    """Compile a list of raw glob strings, dropping patterns that normalize to empty."""
    if not isinstance(raw, (list, tuple)):
        return []
    compiled = [_compile_glob_pattern(item, normalize) for item in raw]
    return [p for p in compiled if p.kind != "exact" or p.value]


def matches_any_glob_pattern(value: str, patterns: Sequence[CompiledGlobPattern]) -> bool:
    """Return True if value matches any of the compiled patterns."""
    for pattern in patterns:
        if pattern.kind == "all":
            return True
        if pattern.kind == "exact" and value == pattern.value:
            return True
        if pattern.kind == "regex" and pattern.value.search(value):  # type: ignore[union-attr]
            return True
    return False

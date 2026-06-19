"""Glob-style exec allowlist pattern matching — port.

Origin:  openclaw/openclaw @ 4799fe7df6c46f3911ecc4db9117bfc329eb4f34
         src/infra/exec-allowlist-pattern.ts (MIT License)
Ported:  2026-06-19. Direct translation, including the macOS `/private/var`
         realpath quirk and the Windows case-insensitive/realpath-resolved
         comparison branch (kept for cross-platform fidelity even though
         Yana-AI's primary host is Linux/Codespaces).
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: a single, carefully-hardened "does this allowlist pattern match this
real path?" function — the piece Yana-AI's existing shell-sanitize-law /
02-terminal-validator regex blocklists do not have: dot-segment normalization
(defends a wildcard pattern against `*/../..` traversal tricks) and a glob
compiler cache, rather than ad hoc string matching.
"""
from __future__ import annotations

import os
import re
import sys

from .home_dir import expand_home_prefix

_GLOB_REGEX_CACHE_LIMIT = 512
_glob_regex_cache: dict[str, re.Pattern[str]] = {}

_WIN = sys.platform == "win32"
_DARWIN = sys.platform == "darwin"


def _normalize_match_target(value: str) -> str:
    if _WIN:
        stripped = re.sub(r"^\\\\[?.]\\", "", value)
        return stripped.replace("\\", "/").lower()
    normalized = value.replace("\\\\", "/")
    if _DARWIN:
        if normalized == "/private/var":
            return "/var"
        if normalized.startswith("/private/var/"):
            return normalized[len("/private") :]
    return normalized


def _try_realpath(value: str) -> str | None:
    try:
        return os.path.realpath(value, strict=True)
    except OSError:
        return None


def _has_dot_path_segment(value: str) -> bool:
    return any(segment in (".", "..") for segment in value.replace("\\", "/").split("/"))


def _normalize_dot_path_segments(value: str) -> str:
    normalized = os.path.normpath(value).replace("\\", "/") if _WIN else os.path.normpath(value)
    return _normalize_match_target(normalized)


def _escape_regexp_literal(ch: str) -> str:
    return re.escape(ch)


def _compile_glob_regex(pattern: str) -> re.Pattern[str]:
    cache_key = f"{sys.platform}:{pattern}"
    cached = _glob_regex_cache.get(cache_key)
    if cached is not None:
        return cached

    regex_parts = ["^"]
    i = 0
    n = len(pattern)
    while i < n:
        ch = pattern[i]
        if ch == "*":
            nxt = pattern[i + 1] if i + 1 < n else None
            if nxt == "*":
                regex_parts.append(".*")
                i += 2
                continue
            regex_parts.append("[^/]*")
            i += 1
            continue
        if ch == "?":
            regex_parts.append("[^/]")
            i += 1
            continue
        regex_parts.append(_escape_regexp_literal(ch))
        i += 1
    regex_parts.append("$")

    flags = re.IGNORECASE if _WIN else 0
    compiled = re.compile("".join(regex_parts), flags)
    if len(_glob_regex_cache) >= _GLOB_REGEX_CACHE_LIMIT:
        _glob_regex_cache.clear()
    _glob_regex_cache[cache_key] = compiled
    return compiled


def matches_exec_allowlist_pattern(pattern: str, target: str) -> bool:
    """Return True when `pattern` (a glob, possibly `~`-prefixed) matches `target`."""
    trimmed = pattern.strip()
    if not trimmed:
        return False

    expanded = expand_home_prefix(trimmed) if trimmed.startswith("~") else trimmed
    has_wildcard = "*" in expanded or "?" in expanded
    normalized_pattern = expanded
    normalized_target = target
    if _WIN and not has_wildcard:
        normalized_pattern = _try_realpath(expanded) or expanded
        normalized_target = _try_realpath(target) or target
    normalized_pattern = _normalize_match_target(normalized_pattern)
    normalized_target = _normalize_match_target(normalized_target)
    # Normalize only the target — glob patterns are operator-authored strings,
    # and normalizing them could change wildcard structure such as `*/..`.
    if has_wildcard and _has_dot_path_segment(normalized_target):
        normalized_target = _normalize_dot_path_segments(normalized_target)
    return bool(_compile_glob_regex(normalized_pattern).match(normalized_target))

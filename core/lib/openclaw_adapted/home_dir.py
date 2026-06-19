"""Effective home-directory resolution — port, adapted.

Origin:  openclaw/openclaw @ 4799fe7df6c46f3911ecc4db9117bfc329eb4f34
         src/infra/home-dir.ts (MIT License)
Ported:  2026-06-19. Adapted: the `OPENCLAW_HOME` override env var is renamed
         to `YANA_HOME`; the Termux/Android-sandbox special case is dropped
         (irrelevant outside OpenClaw's mobile app — Yana-AI has no Android
         target). Otherwise a direct translation of the override-precedence
         and `~`-expansion algorithm.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: resolve the home directory exec-gate path checks should expand `~`
against, honoring an explicit override before falling back to the OS home.
"""
from __future__ import annotations

import os
from pathlib import Path


def _normalize(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed or trimmed in ("undefined", "null"):
        return None
    return trimmed


def _resolve_raw_os_home_dir(env: dict[str, str]) -> str | None:
    return _normalize(env.get("HOME")) or _normalize(env.get("USERPROFILE")) or _normalize(
        os.path.expanduser("~") if os.path.expanduser("~") != "~" else None
    )


def _resolve_raw_home_dir(env: dict[str, str]) -> str | None:
    explicit_home = _normalize(env.get("YANA_HOME"))
    if not explicit_home:
        return _resolve_raw_os_home_dir(env)
    if explicit_home == "~" or explicit_home.startswith("~/") or explicit_home.startswith("~\\"):
        fallback_home = _resolve_raw_os_home_dir(env)
        if not fallback_home:
            return None
        return fallback_home + explicit_home[1:]
    return explicit_home


def resolve_effective_home_dir(env: dict[str, str] | None = None) -> str | None:
    """Resolve the effective home, honoring YANA_HOME before OS homes."""
    raw = _resolve_raw_home_dir(env if env is not None else dict(os.environ))
    return str(Path(raw).resolve()) if raw else None


def resolve_os_home_dir(env: dict[str, str] | None = None) -> str | None:
    """Resolve the underlying OS user home, ignoring YANA_HOME overrides."""
    raw = _resolve_raw_os_home_dir(env if env is not None else dict(os.environ))
    return str(Path(raw).resolve()) if raw else None


def resolve_required_home_dir(env: dict[str, str] | None = None) -> str:
    """Resolve the effective home or fall back to cwd when no home exists."""
    return resolve_effective_home_dir(env) or str(Path.cwd().resolve())


def expand_home_prefix(
    value: str,
    *,
    home: str | None = None,
    env: dict[str, str] | None = None,
) -> str:
    """Expand a leading `~`, `~/`, or `~\\` with the effective home, if known."""
    if not value.startswith("~"):
        return value
    resolved_home = _normalize(home) or resolve_effective_home_dir(env)
    if not resolved_home:
        return value
    if value == "~" or value.startswith("~/") or value.startswith("~\\"):
        return resolved_home + value[1:]
    return value


def resolve_home_relative_path(value: str, *, env: dict[str, str] | None = None) -> str:
    """Trim, expand `~`, and resolve a user-supplied path against the home."""
    trimmed = value.strip()
    if not trimmed:
        return trimmed
    if trimmed.startswith("~"):
        expanded = expand_home_prefix(trimmed, home=resolve_required_home_dir(env), env=env)
        return str(Path(expanded).resolve())
    return str(Path(trimmed).resolve())

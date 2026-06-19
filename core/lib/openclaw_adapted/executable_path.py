"""PATH/PATHEXT executable resolution — port.

Origin:  openclaw/openclaw @ 4799fe7df6c46f3911ecc4db9117bfc329eb4f34
         src/infra/executable-path.ts (MIT License)
Ported:  2026-06-19. Direct translation. `resolveExecutable` (a Windows-only
         legacy alias resolver) was dropped — nothing in this port calls it;
         `resolve_executable_path` already covers the same ground generically.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: resolve a raw executable token (bare name, relative path, `~`-path,
or absolute path) to a real filesystem path, the way exec-command-resolution
needs to before an allowlist trust check can be meaningful — a bare allowlist
pattern must never be satisfied by an unresolved, unverified token.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from .home_dir import expand_home_prefix

_WIN = sys.platform == "win32"


def _is_driveless_windows_rooted_path(value: str) -> bool:
    return _WIN and len(value) >= 2 and value[0] == ":" and value[1] in ("\\", "/")


def resolve_executable_path_candidate(
    raw_executable: str,
    *,
    cwd: str | None = None,
    env: dict[str, str] | None = None,
    require_path_separator: bool = False,
) -> str | None:
    expanded = (
        expand_home_prefix(raw_executable, env=env)
        if raw_executable.startswith("~")
        else raw_executable
    )
    if _is_driveless_windows_rooted_path(expanded):
        return None
    has_path_separator = "/" in expanded or "\\" in expanded
    if require_path_separator and not has_path_separator:
        return None
    if not has_path_separator:
        return expanded
    if os.path.isabs(expanded):
        return str(Path(expanded).resolve(strict=False))
    base = cwd.strip() if cwd and cwd.strip() else os.getcwd()
    return str((Path(base) / expanded).resolve(strict=False))


def _windows_executable_extensions(executable: str, env: dict[str, str] | None) -> list[str]:
    if not _WIN:
        return [""]
    if Path(executable).suffix:
        return [""]
    pathext = (env or {}).get("PATHEXT") or os.environ.get("PATHEXT") or ".EXE;.CMD;.BAT;.COM"
    return [""] + [ext.lower() for ext in pathext.split(";")]


def is_executable_file(file_path: str) -> bool:
    try:
        p = Path(file_path)
        if not p.is_file():
            return False
        if _WIN:
            ext = p.suffix.lower()
            if not ext:
                return True
            pathext = os.environ.get("PATHEXT") or ".EXE;.CMD;.BAT;.COM"
            return ext in {e.lower() for e in pathext.split(";") if e}
        return os.access(file_path, os.X_OK)
    except OSError:
        return False


def resolve_executable_from_path_env(
    executable: str, path_env: str, env: dict[str, str] | None = None
) -> str | None:
    delimiter = ";" if _WIN else os.pathsep
    entries = [e for e in path_env.split(delimiter) if e]
    extensions = _windows_executable_extensions(executable, env)
    for entry in entries:
        for ext in extensions:
            candidate = str(Path(entry) / (executable + ext))
            if is_executable_file(candidate):
                return candidate
    return None


def resolve_executable_path(
    raw_executable: str, *, cwd: str | None = None, env: dict[str, str] | None = None
) -> str | None:
    candidate = resolve_executable_path_candidate(raw_executable, cwd=cwd, env=env)
    if not candidate:
        return None
    if "/" in candidate or "\\" in candidate:
        return candidate if is_executable_file(candidate) else None
    env_path = (env or {}).get("PATH") or os.environ.get("PATH") or ""
    return resolve_executable_from_path_env(candidate, env_path, env)

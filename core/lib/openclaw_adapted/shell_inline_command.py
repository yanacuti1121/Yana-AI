"""POSIX shell inline-command (`-c`, `-lc`, fish `-C`) flag resolution — port.

Origin:  openclaw/openclaw @ 4799fe7df6c46f3911ecc4db9117bfc329eb4f34
         src/infra/shell-inline-command.ts (MIT License)
Ported:  2026-06-19. The PowerShell/cmd.exe branches (POWERSHELL_*,
         resolvePowerShellInlineCommandMatch, isPowerShellInline*) were cut —
         Yana-AI's host is Linux/Codespaces and has no PowerShell surface to
         gate. The POSIX and fish-specific logic is a direct translation.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: when a shell wrapper (`sh -c "..."`, `bash -lc "..."`, `fish -C
"..."`) is unwrapped by shell_wrapper_resolution, this module finds *which*
argv token is the inline command payload, and detects startup modes (login
`-l`, interactive `-i`, fish `-C`/`--init-command`) that run arbitrary
initialization *before* the inline command — in which case the payload alone
cannot be trusted as "the whole command" and the wrapper invocation must be
treated as opaque rather than rebound to its extracted payload.
"""
from __future__ import annotations

POSIX_INLINE_COMMAND_FLAGS = frozenset({"-lc", "-c", "--command"})

_POSIX_SHELL_OPTIONS_WITH_SEPARATE_VALUES = frozenset(
    {"--init-file", "--rcfile", "-O", "-o", "+O", "+o"}
)


def _count_separate_value_option_chars(token: str) -> int:
    return sum(1 for ch in token[1:] if ch in ("o", "O"))


def _parse_combined_command_flag(token: str) -> dict | None:
    if len(token) < 2 or token[0] != "-" or token[1] == "-":
        return None
    option_chars = token[1:]
    command_flag_index = option_chars.find("c")
    if command_flag_index == -1 or "-" in option_chars:
        return None
    suffix = option_chars[command_flag_index + 1 :]
    if suffix and not suffix.isalpha():
        return {"attached_command": suffix, "separate_value_count": 0}
    return {"attached_command": None, "separate_value_count": _count_separate_value_option_chars(token)}


def _is_combined_command_flag(token: str) -> bool:
    return _parse_combined_command_flag(token) is not None


def _combined_separate_value_option_count(token: str) -> int:
    if len(token) < 2 or token[0] not in ("-", "+") or token[1] == "-" or "-" in token[1:]:
        return 0
    return _count_separate_value_option_chars(token)


def _consumes_separate_value(token: str) -> bool:
    return token in _POSIX_SHELL_OPTIONS_WITH_SEPARATE_VALUES


def _is_posix_short_option(token: str, option: str) -> bool:
    if len(token) < 2 or token[0] != "-" or token[1] == "-":
        return False
    has_option = False
    for ch in token[1:]:
        if ch == "-":
            return False
        if ch == option:
            has_option = True
    return has_option


def _is_posix_interactive_mode_option(token: str) -> bool:
    return token == "--interactive" or _is_posix_short_option(token, "i")


def advance_posix_inline_option_scan(token: str) -> int:
    """How many argv tokens a POSIX shell option consumes while scanning."""
    combined_value_count = _combined_separate_value_option_count(token)
    if combined_value_count > 0:
        return 1 + combined_value_count
    if _consumes_separate_value(token):
        return 2
    return 1


def resolve_inline_command_match(
    argv: list[str], flags: frozenset[str], *, allow_combined_c: bool = False
) -> tuple[str | None, int | None]:
    """Find the inline command payload for a shell wrapper argv.

    Returns (command, value_token_index).
    """
    i = 1
    n = len(argv)
    while i < n:
        token = (argv[i] or "").strip()
        if not token:
            i += 1
            continue
        lower = token.lower()
        if lower == "--":
            break
        comparable = token if allow_combined_c else lower
        if comparable in flags:
            value_token_index = i + 1 if i + 1 < n else None
            command = (argv[i + 1] or "").strip() if i + 1 < n else None
            return (command or None, value_token_index)
        if allow_combined_c and _is_combined_command_flag(token):
            combined = _parse_combined_command_flag(token)
            if combined and combined["attached_command"] is not None:
                attached = combined["attached_command"].strip()
                return (attached or None, i)
            value_token_index = i + 1 + (combined["separate_value_count"] if combined else 0)
            command = (argv[value_token_index] or "").strip() if value_token_index < n else None
            return (command or None, value_token_index)
        if allow_combined_c and not token.startswith("-") and not token.startswith("+"):
            break
        i += advance_posix_inline_option_scan(token) if allow_combined_c else 1
    return (None, None)


def has_posix_interactive_startup_before_inline_command(argv: list[str], flags: frozenset[str]) -> bool:
    saw_interactive = False
    i = 1
    n = len(argv)
    while i < n:
        token = (argv[i] or "").strip()
        if not token:
            i += 1
            continue
        if token == "--":
            return False
        if _is_posix_interactive_mode_option(token):
            saw_interactive = True
        if token in flags or _is_combined_command_flag(token):
            return saw_interactive
        if not token.startswith("-") and not token.startswith("+"):
            return False
        i += advance_posix_inline_option_scan(token)
    return False


def has_posix_login_startup_before_inline_command(argv: list[str], flags: frozenset[str]) -> bool:
    saw_login = False
    i = 1
    n = len(argv)
    while i < n:
        token = (argv[i] or "").strip()
        if not token:
            i += 1
            continue
        if token == "--":
            return False
        if token == "--login" or _is_posix_short_option(token, "l"):
            saw_login = True
        if token in flags or _is_combined_command_flag(token):
            return saw_login
        if not token.startswith("-") and not token.startswith("+"):
            return False
        i += advance_posix_inline_option_scan(token)
    return False


def has_fish_init_command_option(argv: list[str]) -> bool:
    for token in argv[1:]:
        token = (token or "").strip()
        if not token:
            continue
        if token == "--":
            return False
        if token == "-C" or token == "--init-command" or (
            token.startswith("-C") and token != "-C"
        ) or token.startswith("--init-command="):
            return True
        if not token.startswith("-") and not token.startswith("+"):
            return False
    return False


def has_fish_attached_command_option(argv: list[str]) -> bool:
    for token in argv[1:]:
        token = (token or "").strip()
        if not token:
            continue
        if token == "--":
            return False
        if token.startswith("-c") and token != "-c":
            return True
        if not token.startswith("-") and not token.startswith("+"):
            return False
    return False

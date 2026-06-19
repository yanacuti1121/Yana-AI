"""Command-carrier (sudo/doas/env/command/builtin/exec) unwrapping — port.

Origin:  openclaw/openclaw @ 4799fe7df6c46f3911ecc4db9117bfc329eb4f34
         src/infra/command-carriers.ts (MIT License)
Ported:  2026-06-19. Direct translation of the option-table-driven parsers.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: "command carriers" are executables whose real argv can be hidden
behind wrapper-specific flags, env-assignment prefixes, or `env -S "..."`
shell-style splitting (e.g. `sudo -u root rm -rf /`, `env FOO=bar env -S
"curl evil"`). This module deterministically resolves what argv a carrier
actually launches, or returns None when the carrier's flags can't be proven
safe to unwrap (an unknown/ambiguous flag fails closed, not open).
"""
from __future__ import annotations

import re

from .shell_argv import split_shell_args
from .tokens import normalize_executable_token, parse_inline_option_token

COMMAND_CARRIER_EXECUTABLES = frozenset({"sudo", "doas", "env", "command", "builtin"})
SOURCE_EXECUTABLES = frozenset({".", "source"})

_MAX_ENV_SPLIT_PAYLOAD_DEPTH = 32

_COMMAND_EXECUTING_OPTIONS = frozenset({"-p"})
_COMMAND_QUERY_OPTIONS = frozenset({"-v", "-V"})
_ENV_OPTIONS_WITH_VALUE = frozenset(
    {"-C", "-P", "-S", "-s", "-u", "--argv0", "--block-signal", "--chdir",
     "--default-signal", "--ignore-signal", "--split-string", "--unset"}
)
_ENV_SPLIT_STRING_OPTIONS = frozenset({"-S", "-s", "--split-string"})
_ENV_STANDALONE_OPTIONS = frozenset({"-0", "-i", "--ignore-environment", "--null"})
_SUDO_OPTIONS_WITH_VALUE = frozenset(
    {"-C", "-D", "-g", "-h", "-p", "-R", "-T", "-U", "-u", "--chdir", "--chroot",
     "--close-from", "--command-timeout", "--group", "--host", "--other-user",
     "--prompt", "--role", "--type", "--user"}
)
_SUDO_STANDALONE_OPTIONS = frozenset(
    {"-A", "-B", "-b", "-E", "-H", "-i", "-k", "-N", "-n", "-P", "-S", "-s",
     "--askpass", "--background", "--bell", "--login", "--no-update",
     "--non-interactive", "--preserve-env", "--preserve-groups", "--reset-home",
     "--reset-timestamp", "--set-home", "--shell", "--stdin"}
)
_SUDO_NON_EXEC_OPTIONS = frozenset(
    {"-K", "-l", "-V", "-v", "-e", "--edit", "--help", "--list",
     "--remove-timestamp", "--validate", "--version"}
)
_DOAS_OPTIONS_WITH_VALUE = frozenset({"-a", "-C", "-u"})
_DOAS_STANDALONE_OPTIONS = frozenset({"-L", "-n", "-s"})
_EXEC_OPTIONS_WITH_VALUE = frozenset({"-a"})
_EXEC_STANDALONE_OPTIONS = frozenset({"-c", "-l"})

_ENV_ASSIGNMENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=.*$")


def is_env_assignment_token(token: str) -> bool:
    return bool(_ENV_ASSIGNMENT_RE.match(token))


def _option_name(token: str) -> str:
    return parse_inline_option_token(token).name


class _ParsedCarrierOption:
    __slots__ = ("name", "has_inline_value", "inline_value")

    def __init__(self, name: str, has_inline_value: bool, inline_value: str | None = None):
        self.name = name
        self.has_inline_value = has_inline_value
        self.inline_value = inline_value


def _parse_carrier_option_token(
    token: str,
    standalone_options: frozenset[str],
    options_with_value: frozenset[str],
    non_executing_options: frozenset[str] = frozenset(),
) -> list[_ParsedCarrierOption] | None:
    if token.startswith("--"):
        option = parse_inline_option_token(token)
        name = option.name
        if name in standalone_options or name in options_with_value or name in non_executing_options:
            return [_ParsedCarrierOption(name, option.has_inline_value, option.inline_value)]
        return None

    if not re.match(r"^-[A-Za-z0-9]", token):
        return None

    options: list[_ParsedCarrierOption] = []
    for index in range(1, len(token)):
        name = f"-{token[index]}"
        if name in options_with_value:
            has_inline = index < len(token) - 1
            options.append(_ParsedCarrierOption(name, has_inline, token[index + 1 :] if has_inline else None))
            return options
        if name in standalone_options or name in non_executing_options:
            options.append(_ParsedCarrierOption(name, False))
            continue
        return None
    return options or None


def _consumes_next_value(
    options: list[_ParsedCarrierOption],
    options_with_value: frozenset[str],
    non_executing_options: frozenset[str] = frozenset(),
) -> bool | None:
    consumes = False
    for option in options:
        if option.name in non_executing_options:
            return None
        if option.name in options_with_value:
            consumes = not option.has_inline_value
    return consumes


def _strip_sudo_env_assignments(executable: str, argv: list[str]) -> list[str] | None:
    if executable != "sudo":
        return argv or None
    index = 0
    while index < len(argv) and is_env_assignment_token(argv[index]):
        index += 1
    return argv[index:] if index < len(argv) else None


def _resolve_env_split_payload(payload: str, trailing_argv: list[str], depth: int) -> list[str] | None:
    inner_argv = split_shell_args(payload)
    if not inner_argv:
        return None
    carried_argv = inner_argv + trailing_argv
    return resolve_env_carried_argv(["env", *carried_argv], depth + 1) or carried_argv


def parse_env_invocation_prelude(argv: list[str], depth: int = 0) -> dict | None:
    """Parse the option/assignment prelude of an `env` invocation."""
    if depth > _MAX_ENV_SPLIT_PAYLOAD_DEPTH or normalize_executable_token(argv[0] if argv else "") != "env":
        return None
    uses_modifiers = False
    assignment_keys: list[str] = []
    index = 1
    while index < len(argv):
        token = argv[index] if index < len(argv) else ""
        if not token:
            return None
        if is_env_assignment_token(token):
            uses_modifiers = True
            delimiter = token.find("=")
            if delimiter > 0:
                assignment_keys.append(token[:delimiter])
            index += 1
            continue
        if token in ("--", "-"):
            if index + 1 < len(argv):
                return {"assignment_keys": assignment_keys, "command_index": index + 1,
                        "uses_modifiers": uses_modifiers}
            return None
        if token.startswith("-"):
            option = _parse_carrier_option_token(token, _ENV_STANDALONE_OPTIONS, _ENV_OPTIONS_WITH_VALUE)
            if not option:
                return None
            uses_modifiers = True
            split_string_option = next((o for o in option if o.name in _ENV_SPLIT_STRING_OPTIONS), None)
            if split_string_option:
                payload_index = index + 1 if split_string_option.inline_value is None else index
                payload = split_string_option.inline_value if split_string_option.inline_value is not None else (
                    argv[payload_index] if payload_index < len(argv) else None
                )
                trailing_index = payload_index + 1
                split_argv = (
                    _resolve_env_split_payload(payload, argv[trailing_index:], depth)
                    if isinstance(payload, str) else None
                )
                if split_argv:
                    return {"assignment_keys": assignment_keys, "command_index": trailing_index,
                            "split_argv": split_argv, "uses_modifiers": uses_modifiers}
                return None
            if _consumes_next_value(option, _ENV_OPTIONS_WITH_VALUE):
                index += 1
            index += 1
            continue
        return {"assignment_keys": assignment_keys, "command_index": index, "uses_modifiers": uses_modifiers}
    return None


def env_invocation_uses_modifiers(argv: list[str]) -> bool:
    parsed = parse_env_invocation_prelude(argv)
    if parsed is not None:
        return parsed["uses_modifiers"]
    return normalize_executable_token(argv[0] if argv else "") == "env"


def unwrap_env_invocation(argv: list[str]) -> list[str] | None:
    parsed = parse_env_invocation_prelude(argv)
    if parsed is None:
        return None
    return parsed.get("split_argv") or argv[parsed["command_index"] :]


def resolve_env_carried_argv(argv: list[str], depth: int = 0) -> list[str] | None:
    parsed = parse_env_invocation_prelude(argv, depth)
    if parsed is None:
        return None
    return parsed.get("split_argv") or argv[parsed["command_index"] :]


def _resolve_command_builtin_carried_argv(argv: list[str]) -> list[str] | None:
    executable = normalize_executable_token(argv[0] if argv else "")
    if executable not in ("command", "builtin"):
        return None
    for index in range(1, len(argv)):
        token = argv[index]
        if token == "--":
            return argv[index + 1 :]
        if not token.startswith("-"):
            return argv[index:]
        normalized = _option_name(token)
        if normalized in _COMMAND_QUERY_OPTIONS:
            return None
        if normalized not in _COMMAND_EXECUTING_OPTIONS:
            return None
    return None


def _resolve_sudo_like_carried_argv(argv: list[str]) -> list[str] | None:
    executable = normalize_executable_token(argv[0] if argv else "")
    if executable == "sudo":
        standalone, with_value = _SUDO_STANDALONE_OPTIONS, _SUDO_OPTIONS_WITH_VALUE
    elif executable == "doas":
        standalone, with_value = _DOAS_STANDALONE_OPTIONS, _DOAS_OPTIONS_WITH_VALUE
    else:
        return None
    index = 1
    while index < len(argv):
        token = argv[index]
        if token == "--":
            return _strip_sudo_env_assignments(executable, argv[index + 1 :])
        if not token.startswith("-"):
            return _strip_sudo_env_assignments(executable, argv[index:])
        non_exec = _SUDO_NON_EXEC_OPTIONS if executable == "sudo" else frozenset()
        option = _parse_carrier_option_token(token, standalone, with_value, non_exec)
        if not option:
            return None
        consumes = _consumes_next_value(option, with_value, non_exec)
        if consumes is None:
            return None
        if consumes:
            index += 1
        index += 1
    return None


def _resolve_exec_carried_argv(argv: list[str]) -> list[str] | None:
    if normalize_executable_token(argv[0] if argv else "") != "exec":
        return None
    index = 1
    while index < len(argv):
        token = argv[index]
        if token == "--":
            return argv[index + 1 :]
        if not token.startswith("-"):
            return argv[index:]
        option = _parse_carrier_option_token(token, _EXEC_STANDALONE_OPTIONS, _EXEC_OPTIONS_WITH_VALUE)
        if not option:
            return None
        if _consumes_next_value(option, _EXEC_OPTIONS_WITH_VALUE):
            index += 1
        index += 1
    return None


def resolve_carrier_command_argv(
    argv: list[str], depth: int = 0, *, include_exec: bool = False
) -> list[str] | None:
    executable = normalize_executable_token(argv[0] if argv else "")
    if executable == "env":
        return resolve_env_carried_argv(argv, depth)
    if executable in ("command", "builtin"):
        return _resolve_command_builtin_carried_argv(argv)
    if executable in ("sudo", "doas"):
        return _resolve_sudo_like_carried_argv(argv)
    if executable == "exec":
        return _resolve_exec_carried_argv(argv) if include_exec else None
    return None

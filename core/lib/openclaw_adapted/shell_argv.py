"""Shell-style argv splitting — port.

Origin:  openclaw/openclaw @ 4799fe7df6c46f3911ecc4db9117bfc329eb4f34
         src/utils/shell-argv.ts (MIT License)
Ported:  2026-06-19. Direct translation, verbatim algorithm.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: split a shell-like argv string into tokens, honoring POSIX quoting
and the small backslash-escape set double quotes actually recognize. Used by
command_carriers.resolve_env_split_payload (`env -S "..."`) to re-parse a
carried command string into argv without invoking a real shell.
"""
from __future__ import annotations

_DOUBLE_QUOTE_ESCAPES = frozenset({"\\", '"', "$", "`", "\n", "\r"})


def split_shell_args(raw: str) -> list[str] | None:
    """Split a shell-like argv string into tokens.

    Returns None for unterminated quotes or a trailing unresolved escape.
    """
    tokens: list[str] = []
    buf: list[str] = []
    in_single = False
    in_double = False
    escaped = False
    i = 0
    n = len(raw)

    def push_token() -> None:
        if buf:
            tokens.append("".join(buf))
            buf.clear()

    while i < n:
        ch = raw[i]
        if escaped:
            buf.append(ch)
            escaped = False
            i += 1
            continue
        if not in_single and not in_double and ch == "\\":
            escaped = True
            i += 1
            continue
        if in_single:
            if ch == "'":
                in_single = False
            else:
                buf.append(ch)
            i += 1
            continue
        if in_double:
            nxt = raw[i + 1] if i + 1 < n else None
            if ch == "\\" and nxt is not None and nxt in _DOUBLE_QUOTE_ESCAPES:
                buf.append(nxt)
                i += 2
                continue
            if ch == '"':
                in_double = False
            else:
                buf.append(ch)
            i += 1
            continue
        if ch == "'":
            in_single = True
            i += 1
            continue
        if ch == '"':
            in_double = True
            i += 1
            continue
        # "#" starts a comment only when it begins a word.
        if ch == "#" and not buf:
            break
        if ch.isspace():
            push_token()
            i += 1
            continue
        buf.append(ch)
        i += 1

    if escaped or in_single or in_double:
        return None
    push_token()
    return tokens

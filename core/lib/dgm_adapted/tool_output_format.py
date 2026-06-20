"""Format/clean agent tool output before it goes back into the LLM context.

Origin:  jennyzzt/dgm (Darwin Godel Machine) (Apache-2.0)
         https://github.com/jennyzzt/dgm, pinned commit a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2
           - tools/edit.py: `maybe_truncate`, `format_output`
           - tools/bash.py: `filter_error`
Ported:  2026-06-20. All three are pure string-processing functions with no
         I/O or subprocess calls, extracted from otherwise-excluded files.
         The rest of edit.py (`tool_function`/`view_path`/`validate_path`,
         which read/write/list real files) and all of bash.py's
         `BashSession`/`tool_function_call` (which opens an interactive
         `/bin/bash -i` subprocess and pipes arbitrary agent-generated text
         into its stdin) were deliberately NOT ported -- the latter is
         exactly the unrestricted-shell-exec pattern this repo's own
         execution-environment.md and anti-evasion-law.md ban outright.
License: Apache-2.0 (see vendor/dgm/_upstream/LICENSE)

Purpose: `maybe_truncate` is a direct instance of the size-cap step in
agent-middleware-law.md's post-execution stack (LLM04 context-flooding
defense); `format_output`'s "cat -n"-style numbered listing matches the
exact convention Claude Code's own Read tool uses for file output;
`filter_error` strips a specific noisy artifact ("Inappropriate ioctl for
device") that shows up whenever a bash subprocess is run with a pty/`-i`
flag outside a real terminal -- useful for any Yana AI tool wrapper that
shells out to an interactive-mode subprocess and needs clean stderr.
"""
from __future__ import annotations


def maybe_truncate(content: str, max_length: int = 10000) -> str:
    """Truncate long content and mark that it was clipped."""
    if len(content) > max_length:
        return content[:max_length] + "\n<response clipped>"
    return content


def format_output(content: str, path: str, init_line: int = 1) -> str:
    """Render `content` as a 'cat -n'-style numbered listing, truncating if long."""
    content = maybe_truncate(content)
    content = content.expandtabs()
    numbered_lines = [
        f"{i + init_line:6}\t{line}" for i, line in enumerate(content.split("\n"))
    ]
    return f"Here's the result of running `cat -n` on {path}:\n" + "\n".join(numbered_lines) + "\n"


def filter_error(error: str) -> str:
    """Strip noisy 'Inappropriate ioctl for device' artifacts from bash -i stderr.

    That message (plus a few surrounding lines, plus an echoed exit sentinel)
    appears whenever an interactive bash subprocess is driven over a pipe
    instead of a real tty; this removes that block while keeping any
    genuine error output around it.
    """
    filtered_lines: list[str] = []
    error_lines = error.splitlines()
    i = 0
    while i < len(error_lines):
        line = error_lines[i]

        if "Inappropriate ioctl for device" in line:
            i += 3
            # Deviation from upstream: added the `i < len(error_lines)` bound check.
            # Upstream indexes `error_lines[i]` here unconditionally, which raises
            # IndexError if the ioctl line is within 3 lines of the end of input.
            if i < len(error_lines) and "<<exit>>" in error_lines[i]:
                i += 1
            while i < len(error_lines) - 1:
                filtered_lines.append(error_lines[i])
                i += 1
            i += 1
            continue

        filtered_lines.append(line)
        i += 1
    return "\n".join(filtered_lines).strip()

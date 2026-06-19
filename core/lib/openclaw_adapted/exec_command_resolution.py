"""Command/executable resolution and allowlist matching — port.

Origin:  openclaw/openclaw @ 4799fe7df6c46f3911ecc4db9117bfc329eb4f34
         src/infra/exec-command-resolution.ts, src/infra/exec-wrapper-trust-plan.ts
         (MIT License)
Ported:  2026-06-19. Direct translation. The `policyResolution`/getter
         compatibility shims (kept in the original only for JS callers mid-
         migration) were dropped — Python callers read `.policy` directly.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: this is the orchestration layer the exec-approval gate actually
calls. `resolve_command_resolution_from_argv` runs the wrapper-trust plan
(dispatch + shell wrappers) and resolves both the *execution* target (what
will literally run) and the *policy* target (what the wrapper chain says
approval should be checked against — which can differ, e.g. a shell
multiplexer applet). `match_allowlist` then decides whether an
ExecAllowlistEntry actually covers this resolution, by real path (preferred,
via realpath) or by PATH-resolved basename — never by the raw, unverified
token a caller typed.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

from .allowlist_pattern import matches_exec_allowlist_pattern
from .executable_path import (
    is_executable_file,
    resolve_executable_path as _resolve_executable_path,
    resolve_executable_path_candidate,
)
from .shell_wrapper_resolution import extract_bindable_shell_wrapper_inline_command, is_shell_wrapper_executable
from .dispatch_wrapper_resolution import resolve_dispatch_wrapper_trust_plan


@dataclass
class ExecutableResolution:
    raw_executable: str
    resolved_path: str | None = None
    resolved_real_path: str | None = None
    executable_name: str = ""


@dataclass
class CommandResolution:
    execution: ExecutableResolution
    policy: ExecutableResolution
    effective_argv: list[str] | None = None
    wrapper_chain: list[str] = field(default_factory=list)
    policy_blocked: bool = False
    blocked_wrapper: str | None = None


@dataclass
class ExecAllowlistEntry:
    pattern: str
    id: str | None = None
    source: str | None = None
    command_text: str | None = None
    arg_pattern: str | None = None
    last_used_at: float | None = None
    last_used_command: str | None = None
    last_resolved_path: str | None = None


def _parse_first_token(command: str) -> str | None:
    trimmed = command.strip()
    if not trimmed:
        return None
    first = trimmed[0]
    if first in ('"', "'"):
        end = trimmed.find(first, 1)
        return trimmed[1:end] if end > 1 else trimmed[1:]
    match = re.match(r"^[^\s]+", trimmed)
    return match.group(0) if match else None


def _try_resolve_realpath(file_path: str | None) -> str | None:
    if not file_path:
        return None
    try:
        return os.path.realpath(file_path, strict=True)
    except OSError:
        return None


def _build_executable_resolution(raw_executable: str, *, cwd: str | None, env: dict | None) -> ExecutableResolution:
    resolved_path = _resolve_executable_path(raw_executable, cwd=cwd, env=env)
    resolved_real_path = _try_resolve_realpath(resolved_path)
    executable_name = os.path.basename(resolved_path) if resolved_path else raw_executable
    return ExecutableResolution(raw_executable, resolved_path, resolved_real_path, executable_name)


def _build_command_resolution(
    *,
    raw_executable: str,
    policy_raw_executable: str | None = None,
    cwd: str | None = None,
    env: dict | None = None,
    effective_argv: list[str],
    wrapper_chain: list[str],
    policy_blocked: bool,
    blocked_wrapper: str | None = None,
) -> CommandResolution:
    execution = _build_executable_resolution(raw_executable, cwd=cwd, env=env)
    policy = (
        _build_executable_resolution(policy_raw_executable, cwd=cwd, env=env)
        if policy_raw_executable
        else execution
    )
    return CommandResolution(execution, policy, effective_argv, wrapper_chain, policy_blocked, blocked_wrapper)


def resolve_command_resolution(command: str, cwd: str | None = None, env: dict | None = None) -> CommandResolution | None:
    raw_executable = _parse_first_token(command)
    if not raw_executable:
        return None
    return _build_command_resolution(
        raw_executable=raw_executable, effective_argv=[raw_executable], wrapper_chain=[], policy_blocked=False,
        cwd=cwd, env=env,
    )


def resolve_exec_wrapper_trust_plan(argv: list[str]) -> dict:
    """Resolve transparent dispatch/shell wrappers to find the real policy target."""
    current = argv
    policy_argv = argv
    saw_shell_multiplexer = False
    wrapper_chain: list[str] = []
    from .shell_wrapper_resolution import unwrap_known_shell_multiplexer_invocation
    from .dispatch_wrapper_resolution import MAX_DISPATCH_WRAPPER_DEPTH

    max_depth = MAX_DISPATCH_WRAPPER_DEPTH
    for _ in range(max_depth):
        dispatch_plan = resolve_dispatch_wrapper_trust_plan(current, max_depth - len(wrapper_chain))
        if dispatch_plan.policy_blocked:
            return {
                "argv": dispatch_plan.argv, "policy_argv": dispatch_plan.argv, "wrapper_chain": wrapper_chain,
                "policy_blocked": True, "blocked_wrapper": dispatch_plan.blocked_wrapper or (current[0] if current else "unknown"),
            }
        if dispatch_plan.wrappers:
            wrapper_chain.extend(dispatch_plan.wrappers)
            current = dispatch_plan.argv
            if not saw_shell_multiplexer:
                policy_argv = current
            if len(wrapper_chain) >= max_depth:
                break
            continue

        kind, wrapper, unwrapped_argv = unwrap_known_shell_multiplexer_invocation(current)
        if kind == "blocked":
            return {"argv": current, "policy_argv": policy_argv, "wrapper_chain": wrapper_chain,
                    "policy_blocked": True, "blocked_wrapper": wrapper}
        if kind == "unwrapped":
            wrapper_chain.append(wrapper)
            if not saw_shell_multiplexer:
                policy_argv = current
                saw_shell_multiplexer = True
            current = unwrapped_argv
            if len(wrapper_chain) >= max_depth:
                break
            continue
        break

    raw_executable = (current[0] or "").strip() if current else ""
    shell_wrapper_executable = bool(raw_executable) and is_shell_wrapper_executable(raw_executable)
    return {
        "argv": current,
        "policy_argv": policy_argv,
        "wrapper_chain": wrapper_chain,
        "policy_blocked": False,
        "shell_wrapper_executable": shell_wrapper_executable,
        "shell_inline_command": extract_bindable_shell_wrapper_inline_command(current) if shell_wrapper_executable else None,
    }


def resolve_command_resolution_from_argv(
    argv: list[str], cwd: str | None = None, env: dict | None = None
) -> CommandResolution | None:
    plan = resolve_exec_wrapper_trust_plan(argv)
    effective_argv = plan["argv"]
    raw_executable = (effective_argv[0] or "").strip() if effective_argv else ""
    if not raw_executable:
        return None
    policy_argv = plan["policy_argv"]
    return _build_command_resolution(
        raw_executable=raw_executable,
        policy_raw_executable=((policy_argv[0] or "").strip() if policy_argv else None) or None,
        effective_argv=effective_argv,
        wrapper_chain=plan["wrapper_chain"],
        policy_blocked=plan["policy_blocked"],
        blocked_wrapper=plan.get("blocked_wrapper"),
        cwd=cwd, env=env,
    )


def resolve_executable_trust_path(resolution: ExecutableResolution | None, cwd: str | None = None) -> str | None:
    real_path = (resolution.resolved_real_path or "").strip() if resolution else ""
    if real_path:
        return real_path
    candidate = _resolve_executable_candidate_path_from_resolution(resolution, cwd)
    return _try_resolve_realpath(candidate) or candidate


def _resolve_executable_candidate_path_from_resolution(
    resolution: ExecutableResolution | None, cwd: str | None
) -> str | None:
    if not resolution:
        return None
    if resolution.resolved_path:
        return resolution.resolved_path
    raw = (resolution.raw_executable or "").strip()
    if not raw:
        return None
    return resolve_executable_path_candidate(raw, cwd=cwd, require_path_separator=True)


_TRAILING_SHELL_REDIRECTIONS_RE = re.compile(r"\s+(?:[12]>&[12]|[12]>/dev/null)\s*$")


def _strip_trailing_redirections(value: str) -> str:
    prev = value
    while True:
        nxt = _TRAILING_SHELL_REDIRECTIONS_RE.sub("", prev)
        if nxt == prev:
            return nxt
        prev = nxt


def _match_arg_pattern(arg_pattern: str, argv: list[str]) -> bool:
    # Note: the original also retried with forward-slash/backslash normalized
    # on Windows targets; dropped here since this port has no Windows host.
    sep = "\x00" if "\x00" in arg_pattern else " "
    args_slice = argv[1:]
    if sep == "\x00":
        args_string = "\x00\x00" if not args_slice else sep.join(args_slice) + sep
    else:
        args_string = sep.join(args_slice)
    try:
        regex = re.compile(arg_pattern)
    except re.error:
        return False
    if regex.search(args_string):
        return True
    if sep == " ":
        stripped = _strip_trailing_redirections(args_string)
        if stripped != args_string and regex.search(stripped):
            return True
    return False


def _has_path_selector(value: str) -> bool:
    return "/" in value or "\\" in value or "~" in value


def _matches_executable_basename_pattern(pattern: str, resolution: ExecutableResolution) -> bool:
    if _has_path_selector(resolution.raw_executable):
        return False
    candidates = set()
    if resolution.executable_name:
        candidates.add(resolution.executable_name)
    if resolution.resolved_path:
        candidates.add(os.path.basename(resolution.resolved_path))
    return any(matches_exec_allowlist_pattern(pattern, c) for c in candidates)


def match_allowlist(
    entries: list[ExecAllowlistEntry], resolution: ExecutableResolution | None, argv: list[str] | None = None
) -> ExecAllowlistEntry | None:
    """Find the allowlist entry (if any) that trusts this resolved executable."""
    if not entries:
        return None
    bare_wild = next((e for e in entries if (e.pattern or "").strip() == "*" and not e.arg_pattern), None)
    if bare_wild and resolution:
        return bare_wild
    if not resolution or not resolution.resolved_path:
        return None
    trust_path = (resolution.resolved_real_path or "").strip() or resolution.resolved_path
    if not trust_path:
        return None

    path_only_match: ExecAllowlistEntry | None = None
    for entry in entries:
        pattern = (entry.pattern or "").strip()
        if not pattern:
            continue
        pattern_matches = (
            matches_exec_allowlist_pattern(pattern, trust_path)
            if _has_path_selector(pattern)
            else pattern != "*" and _matches_executable_basename_pattern(pattern, resolution)
        )
        if not pattern_matches:
            continue
        if not entry.arg_pattern:
            if path_only_match is None:
                path_only_match = entry
            continue
        if argv and _match_arg_pattern(entry.arg_pattern, argv):
            return entry
    return path_only_match

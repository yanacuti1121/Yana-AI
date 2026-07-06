"""Persistence + Claude-Code-specific adapter for tool_guardrails.py.

`tool_guardrails.py` is a near-verbatim MIT port (see its own docstring) and is
deliberately left unmodified — it has no public save/load API, and its
`IDEMPOTENT_TOOL_NAMES`/`MUTATING_TOOL_NAMES` frozensets use the upstream
project's own tool vocabulary (`read_file`, `terminal`, `write_file`...), not
Claude Code's actual tool names. This module is new code, not part of the port,
that bridges both gaps for `core/hooks/tool-guardrails-detector.sh`:

  - Claude-Code-specific idempotent/mutating tool-name sets
  - deriving `failed` from Claude Code's actual PostToolUse payload shape
  - serializing/deserializing a ToolCallGuardrailController's per-turn state
    to/from a plain JSON-safe dict, since each hook invocation is a fresh
    process with no persistent controller instance to hold onto between calls
"""
from __future__ import annotations

import json
import time
from typing import Any

from core.lib.hermes_adapted.tool_guardrails import (
    ToolCallGuardrailConfig,
    ToolCallGuardrailController,
    ToolCallSignature,
    classify_tool_failure,
)

# Claude Code's own tool names, not hermes-agent's (read_file/terminal/...).
YANA_IDEMPOTENT_TOOLS = frozenset({
    "Read", "Grep", "Glob", "WebFetch", "WebSearch",
    "TaskOutput", "TaskList", "TaskGet",
})
YANA_MUTATING_TOOLS = frozenset({
    "Bash", "Edit", "Write", "NotebookEdit", "Task", "TaskCreate",
    "TaskUpdate", "TaskStop", "SendMessage", "CronCreate", "CronDelete",
})

_SIG_SEP = ":"  # tool names are alnum/hyphen, args_hash is hex — never collides

# Sessions untouched for this long are dropped on the next write — bounds
# tool-guardrail-state.json's growth across a repo's lifetime for sessions
# that never cleanly fire a Stop event (crash, abrupt termination, bypass).
STALE_SESSION_SECONDS = 6 * 60 * 60

_CONTROLLER_ATTRS = ("_exact_failure_counts", "_same_tool_failure_counts", "_no_progress")


def _assert_controller_shape(controller: ToolCallGuardrailController) -> None:
    """Fail loudly if the ported class's internal shape ever drifts.

    tool_guardrails.py has no public save/load API, so this module reads and
    writes its underscore-prefixed attributes directly (see module
    docstring). If a future upstream refresh of that file ever renames or
    restructures them, silently continuing would mean loop detection quietly
    stops working with no signal to anyone — this turns that into an
    explicit failure instead of a silent no-op.
    """
    missing = [attr for attr in _CONTROLLER_ATTRS if not hasattr(controller, attr)]
    if missing:
        raise RuntimeError(
            f"ToolCallGuardrailController is missing expected attribute(s) "
            f"{missing} — tool_guardrails_io.py's persistence adapter is out "
            f"of sync with the ported tool_guardrails.py and needs updating."
        )


def prune_stale_sessions(
    sessions: dict[str, Any], max_age_seconds: int = STALE_SESSION_SECONDS
) -> dict[str, Any]:
    """Drop session entries whose state hasn't been touched in max_age_seconds."""
    now = time.time()
    return {
        sid: entry
        for sid, entry in sessions.items()
        if now - entry.get("_last_touched", now) <= max_age_seconds
    }


def build_config() -> ToolCallGuardrailConfig:
    """Yana AI's guardrail config: Claude Code tool names, warn-only (no hard stop)."""
    return ToolCallGuardrailConfig(
        idempotent_tools=YANA_IDEMPOTENT_TOOLS,
        mutating_tools=YANA_MUTATING_TOOLS,
    )


def derive_failed(tool_name: str, tool_response: Any) -> bool | None:
    """Bridge Claude Code's PostToolUse payload to tool_guardrails' `failed` param.

    Returns True/False when derivable, None to let after_call() fall back to
    classify_tool_failure() on the stringified response itself.
    """
    if isinstance(tool_response, dict):
        exit_code = tool_response.get("exit_code")
        if exit_code is not None:
            return exit_code != 0
        if tool_response.get("is_error") is True:
            return True
        if tool_response.get("is_error") is False:
            return False
        # No explicit signal — let classify_tool_failure() inspect the text.
        text = json.dumps(tool_response, ensure_ascii=False, default=str)
        failed, _ = classify_tool_failure(tool_name, text)
        return failed
    if isinstance(tool_response, str):
        failed, _ = classify_tool_failure(tool_name, tool_response)
        return failed
    return None


def _sig_key(sig: ToolCallSignature) -> str:
    return f"{sig.tool_name}{_SIG_SEP}{sig.args_hash}"


def _sig_from_key(key: str) -> ToolCallSignature:
    tool_name, _, args_hash = key.partition(_SIG_SEP)
    return ToolCallSignature(tool_name=tool_name, args_hash=args_hash)


def load_controller(state: dict[str, Any] | None) -> ToolCallGuardrailController:
    """Rebuild a controller from a previously dumped state dict for one session.

    Directly assigns the controller's internal dicts (it has no public setter —
    see module docstring for why that's intentional rather than a workaround).
    """
    controller = ToolCallGuardrailController(config=build_config())
    _assert_controller_shape(controller)
    state = state or {}

    exact = {}
    for key, count in state.get("exact_failure_counts", {}).items():
        exact[_sig_from_key(key)] = int(count)
    controller._exact_failure_counts = exact  # noqa: SLF001 — see docstring

    same_tool = {
        str(tool_name): int(count)
        for tool_name, count in state.get("same_tool_failure_counts", {}).items()
    }
    controller._same_tool_failure_counts = same_tool  # noqa: SLF001

    no_progress = {}
    for key, pair in state.get("no_progress", {}).items():
        result_hash, count = pair
        no_progress[_sig_from_key(key)] = (str(result_hash), int(count))
    controller._no_progress = no_progress  # noqa: SLF001

    return controller


def dump_state(controller: ToolCallGuardrailController) -> dict[str, Any]:
    """Serialize a controller's per-turn state to a JSON-safe plain dict."""
    _assert_controller_shape(controller)
    return {
        "exact_failure_counts": {
            _sig_key(sig): count
            for sig, count in controller._exact_failure_counts.items()  # noqa: SLF001
        },
        "same_tool_failure_counts": dict(controller._same_tool_failure_counts),  # noqa: SLF001
        "no_progress": {
            _sig_key(sig): list(pair)
            for sig, pair in controller._no_progress.items()  # noqa: SLF001
        },
        "_last_touched": time.time(),
    }

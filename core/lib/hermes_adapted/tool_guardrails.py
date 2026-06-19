"""Tool-call loop guardrail primitives — near-faithful port.

Origin:  NousResearch/hermes-agent @ 5378b941209d8f62a65455041658ce8ce8144cc9
         agent/tool_guardrails.py (MIT License)
Ported:  2026-06-19. This file was already self-contained/side-effect-free in
         the original ("pure" by the author's own docstring), so the port is
         close to verbatim. The two external imports were inlined:
           - utils.safe_json_loads                          -> _safe_json_loads
           - agent.tool_result_classification.file_mutation_result_landed
             (agent/tool_result_classification.py)          -> _file_mutation_result_landed
License: MIT (see vendor/hermes-agent/_upstream/LICENSE)

Purpose: detect tool-call loops within a single turn — the same call failing
repeatedly with identical arguments, the same tool failing repeatedly with
varying arguments, or an idempotent (read-only) call returning the same
result over and over with no progress — and return a decision (allow / warn
/ block / halt) without taking any action itself. The caller decides what a
warning or halt means at runtime.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Mapping

IDEMPOTENT_TOOL_NAMES = frozenset({
    "read_file", "search_files", "web_search", "web_extract", "session_search",
    "browser_snapshot", "browser_console", "browser_get_images",
})

MUTATING_TOOL_NAMES = frozenset({
    "terminal", "execute_code", "write_file", "patch", "todo", "memory",
    "browser_click", "browser_type", "browser_navigate", "send_message",
})

_FILE_MUTATING_TOOL_NAMES = frozenset({"write_file", "patch"})


def _safe_json_loads(text: str | None) -> Any:
    if not text:
        return None
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return None


def _file_mutation_result_landed(tool_name: str, result: Any) -> bool:
    """Return True when a file mutation result proves the write landed."""
    if tool_name not in _FILE_MUTATING_TOOL_NAMES or not isinstance(result, str):
        return False
    data = _safe_json_loads(result.strip())
    if not isinstance(data, dict) or data.get("error"):
        return False
    if tool_name == "write_file":
        return "bytes_written" in data
    if tool_name == "patch":
        return data.get("success") is True
    return False


@dataclass(frozen=True)
class ToolCallGuardrailConfig:
    """Thresholds for per-turn tool-call loop detection.

    Warnings never block execution. Hard stops are opt-in (`hard_stop_enabled`)
    so interactive sessions get a nudge by default, not an involuntary halt.
    """
    warnings_enabled: bool = True
    hard_stop_enabled: bool = False
    exact_failure_warn_after: int = 2
    exact_failure_block_after: int = 5
    same_tool_failure_warn_after: int = 3
    same_tool_failure_halt_after: int = 8
    no_progress_warn_after: int = 2
    no_progress_block_after: int = 5
    idempotent_tools: frozenset[str] = field(default_factory=lambda: IDEMPOTENT_TOOL_NAMES)
    mutating_tools: frozenset[str] = field(default_factory=lambda: MUTATING_TOOL_NAMES)


@dataclass(frozen=True)
class ToolCallSignature:
    """Stable, non-reversible identity for a tool name plus canonical args."""
    tool_name: str
    args_hash: str

    @classmethod
    def from_call(cls, tool_name: str, args: Mapping[str, Any] | None) -> "ToolCallSignature":
        canonical = canonical_tool_args(args or {})
        return cls(tool_name=tool_name, args_hash=_sha256(canonical))


@dataclass(frozen=True)
class ToolGuardrailDecision:
    action: str = "allow"  # allow | warn | block | halt
    code: str = "allow"
    message: str = ""
    tool_name: str = ""
    count: int = 0
    signature: ToolCallSignature | None = None

    @property
    def allows_execution(self) -> bool:
        return self.action in {"allow", "warn"}

    @property
    def should_halt(self) -> bool:
        return self.action in {"block", "halt"}


def canonical_tool_args(args: Mapping[str, Any]) -> str:
    if not isinstance(args, Mapping):
        raise TypeError(f"tool args must be a mapping, got {type(args).__name__}")
    return json.dumps(args, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def classify_tool_failure(tool_name: str, result: str | None) -> tuple[bool, str]:
    """Fallback classifier used only when callers don't pass `failed` explicitly."""
    if result is None:
        return False, ""
    if _file_mutation_result_landed(tool_name, result):
        return False, ""
    if tool_name == "terminal":
        data = _safe_json_loads(result)
        if isinstance(data, dict):
            exit_code = data.get("exit_code")
            if exit_code is not None and exit_code != 0:
                return True, f" [exit {exit_code}]"
        return False, ""
    lower = result[:500].lower()
    if '"error"' in lower or '"failed"' in lower or result.startswith("Error"):
        return True, " [error]"
    return False, ""


class ToolCallGuardrailController:
    """Per-turn controller for repeated failed/non-progressing tool calls."""

    def __init__(self, config: ToolCallGuardrailConfig | None = None):
        self.config = config or ToolCallGuardrailConfig()
        self.reset_for_turn()

    def reset_for_turn(self) -> None:
        self._exact_failure_counts: dict[ToolCallSignature, int] = {}
        self._same_tool_failure_counts: dict[str, int] = {}
        self._no_progress: dict[ToolCallSignature, tuple[str, int]] = {}

    def before_call(self, tool_name: str, args: Mapping[str, Any] | None) -> ToolGuardrailDecision:
        signature = ToolCallSignature.from_call(tool_name, _coerce_args(args))
        if not self.config.hard_stop_enabled:
            return ToolGuardrailDecision(tool_name=tool_name, signature=signature)

        exact_count = self._exact_failure_counts.get(signature, 0)
        if exact_count >= self.config.exact_failure_block_after:
            return ToolGuardrailDecision(
                action="block", code="repeated_exact_failure_block",
                message=f"Blocked {tool_name}: same call failed {exact_count} times identically. "
                        "Stop retrying it unchanged; change strategy.",
                tool_name=tool_name, count=exact_count, signature=signature,
            )

        if self._is_idempotent(tool_name):
            record = self._no_progress.get(signature)
            if record is not None and record[1] >= self.config.no_progress_block_after:
                return ToolGuardrailDecision(
                    action="block", code="idempotent_no_progress_block",
                    message=f"Blocked {tool_name}: read-only call returned the same result "
                            f"{record[1]} times. Use the result already provided.",
                    tool_name=tool_name, count=record[1], signature=signature,
                )
        return ToolGuardrailDecision(tool_name=tool_name, signature=signature)

    def after_call(self, tool_name: str, args: Mapping[str, Any] | None, result: str | None,
                    *, failed: bool | None = None) -> ToolGuardrailDecision:
        args = _coerce_args(args)
        signature = ToolCallSignature.from_call(tool_name, args)
        if failed is None:
            failed, _ = classify_tool_failure(tool_name, result)

        if failed:
            return self._record_failure(tool_name, signature)

        self._exact_failure_counts.pop(signature, None)
        self._same_tool_failure_counts.pop(tool_name, None)

        if not self._is_idempotent(tool_name):
            self._no_progress.pop(signature, None)
            return ToolGuardrailDecision(tool_name=tool_name, signature=signature)
        return self._record_no_progress(tool_name, signature, result)

    def _record_failure(self, tool_name: str, signature: ToolCallSignature) -> ToolGuardrailDecision:
        exact_count = self._exact_failure_counts.get(signature, 0) + 1
        self._exact_failure_counts[signature] = exact_count
        self._no_progress.pop(signature, None)
        same_count = self._same_tool_failure_counts.get(tool_name, 0) + 1
        self._same_tool_failure_counts[tool_name] = same_count

        if self.config.hard_stop_enabled and same_count >= self.config.same_tool_failure_halt_after:
            return ToolGuardrailDecision(
                action="halt", code="same_tool_failure_halt",
                message=f"Stopped {tool_name}: failed {same_count} times this turn. "
                        "Choose a different approach.",
                tool_name=tool_name, count=same_count, signature=signature,
            )
        if self.config.warnings_enabled and exact_count >= self.config.exact_failure_warn_after:
            return ToolGuardrailDecision(
                action="warn", code="repeated_exact_failure_warning",
                message=f"{tool_name} failed {exact_count} times with identical arguments — "
                        "this looks like a loop; change strategy instead of retrying unchanged.",
                tool_name=tool_name, count=exact_count, signature=signature,
            )
        if self.config.warnings_enabled and same_count >= self.config.same_tool_failure_warn_after:
            return ToolGuardrailDecision(
                action="warn", code="same_tool_failure_warning",
                message=_tool_failure_recovery_hint(tool_name, same_count),
                tool_name=tool_name, count=same_count, signature=signature,
            )
        return ToolGuardrailDecision(tool_name=tool_name, count=exact_count, signature=signature)

    def _record_no_progress(self, tool_name: str, signature: ToolCallSignature,
                             result: str | None) -> ToolGuardrailDecision:
        result_hash = _result_hash(result)
        previous = self._no_progress.get(signature)
        repeat_count = previous[1] + 1 if previous is not None and previous[0] == result_hash else 1
        self._no_progress[signature] = (result_hash, repeat_count)

        if self.config.warnings_enabled and repeat_count >= self.config.no_progress_warn_after:
            return ToolGuardrailDecision(
                action="warn", code="idempotent_no_progress_warning",
                message=f"{tool_name} returned the same result {repeat_count} times — "
                        "use the result already provided or change the query.",
                tool_name=tool_name, count=repeat_count, signature=signature,
            )
        return ToolGuardrailDecision(tool_name=tool_name, count=repeat_count, signature=signature)

    def _is_idempotent(self, tool_name: str) -> bool:
        if tool_name in self.config.mutating_tools:
            return False
        return tool_name in self.config.idempotent_tools


def toolguard_synthetic_result(decision: ToolGuardrailDecision) -> str:
    """Build a synthetic role=tool content string for a blocked tool call."""
    return json.dumps({"error": decision.message, "code": decision.code}, ensure_ascii=False)


def append_toolguard_guidance(result: str, decision: ToolGuardrailDecision) -> str:
    if decision.action not in {"warn", "halt"} or not decision.message:
        return result
    label = "Tool loop hard stop" if decision.action == "halt" else "Tool loop warning"
    return (result or "") + f"\n\n[{label}: {decision.code}; count={decision.count}; {decision.message}]"


def _tool_failure_recovery_hint(tool_name: str, count: int) -> str:
    common = (f"{tool_name} has failed {count} times this turn. This looks like a loop. "
              "Diagnose before retrying. ")
    if tool_name == "terminal":
        return common + "Run a small diagnostic (`pwd && ls -la`), then try an absolute path or a different tool."
    return common + "Try different arguments, a narrower query, or report the blocker instead of repeating it."


def _coerce_args(args: Mapping[str, Any] | None) -> Mapping[str, Any]:
    return args if isinstance(args, Mapping) else {}


def _result_hash(result: str | None) -> str:
    parsed = _safe_json_loads(result or "")
    if parsed is not None:
        canonical = json.dumps(parsed, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    else:
        canonical = result or ""
    return _sha256(canonical)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

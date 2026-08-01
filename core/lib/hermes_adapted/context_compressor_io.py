"""Persistence + Claude-Code-specific adapter for context_compressor.py.

`context_compressor.py`/`context_compressor_pairs.py` are near-verbatim MIT
ports (see their own docstrings) and are deliberately left unmodified — they
expect OpenAI-tool-calling-shape messages (`role: "system"|"user"|"assistant"
|"tool"`, `tool_calls: [{"id"|"call_id", ...}]` on assistant messages,
`tool_call_id` on tool-result messages) and have no awareness of Claude
Code's transcript format or of how to actually call a model. This module is
new code, not part of the port, that bridges both gaps for
`core/hooks/context-compress-stop.sh`:

  - parsing Claude Code's real transcript JSONL (Anthropic API shape —
    `{"type": "user"|"assistant", "message": {"role", "content"}}`, where
    `content` is either a plain string or a list of content blocks
    (`text`/`tool_use`/`tool_result`)) into the OpenAI-tool-calling shape
    `ContextCompressor.compress()` expects
  - a `summarize_fn` implementation that calls a local Ollama model over
    HTTP (stdlib `urllib`, no new dependency — matches this module family's
    existing "no external deps" convention)
  - serializing/deserializing a ContextCompressor's cross-call state
    (`_previous_summary`, `_last_savings_pct`, `compression_count`, plus the
    2026-07-16 failure-cooldown fields `_fallback_compression_streak` /
    `_summary_failure_cooldown_until` — see context_compressor.py's module
    docstring) to/from a plain JSON-safe dict, since each hook invocation is
    a fresh process with no persistent compressor instance to hold onto
    between calls — same pattern as tool_guardrails_io.py's
    load_controller/dump_state
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any, Optional

from core.lib.hermes_adapted.context_compressor import CompressorConfig, ContextCompressor

# Rough chars-per-token heuristic — matches context_compressor.py's own
# internal estimate (`len(content) // 4`) so should_compress()'s threshold
# check is consistent with the module's own token accounting, not a second,
# differently-calibrated guess.
_CHARS_PER_TOKEN = 4

_COMPRESSOR_ATTRS = (
    "_previous_summary", "_last_savings_pct", "compression_count",
    "_fallback_compression_streak", "_summary_failure_cooldown_until",
)


def _assert_compressor_shape(compressor: ContextCompressor) -> None:
    """Fail loudly if the ported class's internal shape ever drifts.

    context_compressor.py has no public save/load API, so this module reads
    and writes its attributes directly (see module docstring). If a future
    upstream refresh of that file ever renames or restructures them, silently
    continuing would mean anti-thrash tracking and summary continuity quietly
    stop working with no signal to anyone — this turns that into an explicit
    failure instead of a silent no-op (same defense as tool_guardrails_io.py's
    _assert_controller_shape).
    """
    missing = [attr for attr in _COMPRESSOR_ATTRS if not hasattr(compressor, attr)]
    if missing:
        raise RuntimeError(
            f"ContextCompressor is missing expected attribute(s) {missing} — "
            f"context_compressor_io.py's persistence adapter is out of sync "
            f"with the ported context_compressor.py and needs updating."
        )


# ---------------------------------------------------------------------------
# Transcript parsing — Anthropic content-block shape -> OpenAI tool-calling shape
# ---------------------------------------------------------------------------

def _text_from_blocks(blocks: list[Any]) -> str:
    parts = []
    for b in blocks:
        if isinstance(b, dict) and b.get("type") == "text":
            text = b.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(parts)


def _tool_calls_from_blocks(blocks: list[Any]) -> list[dict[str, Any]]:
    calls = []
    for b in blocks:
        if isinstance(b, dict) and b.get("type") == "tool_use":
            calls.append({
                "id": b.get("id", ""),
                "type": "function",
                "function": {
                    "name": b.get("name", ""),
                    "arguments": json.dumps(b.get("input", {}), ensure_ascii=False),
                },
            })
    return calls


def _tool_results_from_blocks(blocks: list[Any]) -> list[dict[str, Any]]:
    results = []
    for b in blocks:
        if not (isinstance(b, dict) and b.get("type") == "tool_result"):
            continue
        content = b.get("content", "")
        if isinstance(content, list):
            content = _text_from_blocks(content)
        elif not isinstance(content, str):
            content = json.dumps(content, ensure_ascii=False, default=str)
        results.append({
            "role": "tool",
            "content": content,
            "tool_call_id": b.get("tool_use_id", ""),
        })
    return results


def parse_transcript_to_messages(transcript_path: str) -> list[dict[str, Any]]:
    """Read a Claude Code transcript JSONL file into context_compressor.py's
    expected message shape.

    Each line is `{"type": "user"|"assistant"|..., "message": {"role", "content"}}`
    (verified against a live transcript — see core/hooks/truth-gate-guard.sh's
    comment for the same schema note). Lines with an unrecognized/missing
    `.message` are skipped rather than raising, since a transcript can contain
    non-conversation entries (e.g. summary/meta lines) this adapter doesn't
    need to understand.
    """
    messages: list[dict[str, Any]] = []
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return messages

    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        msg = entry.get("message")
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        content = msg.get("content")

        if role not in ("user", "assistant", "system"):
            continue

        if isinstance(content, str):
            messages.append({"role": role, "content": content})
            continue

        if not isinstance(content, list):
            continue

        if role == "assistant":
            text = _text_from_blocks(content)
            tool_calls = _tool_calls_from_blocks(content)
            out: dict[str, Any] = {"role": "assistant", "content": text}
            if tool_calls:
                out["tool_calls"] = tool_calls
            messages.append(out)
        else:
            # A Claude Code "user" turn's content list can mix plain text
            # blocks with tool_result blocks (the API returns tool results
            # as part of the next user turn, not as their own top-level
            # role) — split them into a real user text message plus one
            # role="tool" message per result, matching what
            # sanitize_tool_pairs() expects to find.
            text = _text_from_blocks(content)
            if text.strip():
                messages.append({"role": "user", "content": text})
            messages.extend(_tool_results_from_blocks(content))

    return messages


def estimate_prompt_tokens(messages: list[dict[str, Any]]) -> int:
    """Rough token estimate — same chars/4 heuristic context_compressor.py
    uses internally, so should_compress()'s percentage check is measuring
    against a consistent yardstick rather than two different guesses."""
    total_chars = 0
    for m in messages:
        content = m.get("content")
        if isinstance(content, str):
            total_chars += len(content)
        for tc in m.get("tool_calls") or []:
            fn = tc.get("function", {}) if isinstance(tc, dict) else {}
            total_chars += len(str(fn.get("arguments", "")))
    return total_chars // _CHARS_PER_TOKEN


# ---------------------------------------------------------------------------
# Ollama summarize_fn
# ---------------------------------------------------------------------------

def build_ollama_summarize_fn(model: str, host: str, timeout_seconds: float = 60.0):
    """Return a summarize_fn(prompt) -> Optional[str] that calls a local
    Ollama model over HTTP. Returns None on any failure (network, timeout,
    malformed response) so context_compressor.py's existing
    abort_on_summary_failure / static-fallback-summary path handles it —
    this function never raises."""

    def _summarize(prompt: str) -> Optional[str]:
        payload = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode("utf-8")
        req = urllib.request.Request(
            f"{host}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            return None
        text = body.get("response")
        return text if isinstance(text, str) and text.strip() else None

    return _summarize


# ---------------------------------------------------------------------------
# Cross-call state persistence
# ---------------------------------------------------------------------------

def load_compressor(state: dict[str, Any] | None, context_length: int,
                     summarize_fn) -> ContextCompressor:
    """Rebuild a ContextCompressor from a previously dumped state dict for
    one session. Directly assigns internal attributes (no public setter —
    see module docstring)."""
    compressor = ContextCompressor(context_length, cfg=CompressorConfig(), summarize_fn=summarize_fn)
    _assert_compressor_shape(compressor)
    state = state or {}

    compressor._previous_summary = state.get("previous_summary")  # noqa: SLF001
    compressor._last_savings_pct = [float(x) for x in state.get("last_savings_pct", [])]  # noqa: SLF001
    compressor.compression_count = int(state.get("compression_count", 0))

    compressor._fallback_compression_streak = int(  # noqa: SLF001
        state.get("fallback_compression_streak", 0)
    )
    # Cooldown is persisted as an absolute wall-clock deadline (time.time()),
    # not the monotonic value ContextCompressor tracks internally — a
    # monotonic() reading from the previous process is meaningless once the
    # process has exited. Convert back to a fresh monotonic deadline here,
    # accounting for however much real time passed between dump and load.
    cooldown_until_wall = float(state.get("compression_failure_cooldown_until_wall", 0.0))
    remaining = cooldown_until_wall - time.time()
    if remaining > 0:
        compressor._record_compression_failure_cooldown(remaining)  # noqa: SLF001

    return compressor


def dump_state(compressor: ContextCompressor) -> dict[str, Any]:
    """Serialize a ContextCompressor's cross-call state to a JSON-safe dict."""
    _assert_compressor_shape(compressor)
    cooldown = compressor.get_active_compression_failure_cooldown()
    cooldown_until_wall = time.time() + cooldown["remaining_seconds"] if cooldown else 0.0
    return {
        "previous_summary": compressor._previous_summary,  # noqa: SLF001
        "last_savings_pct": list(compressor._last_savings_pct),  # noqa: SLF001
        "compression_count": compressor.compression_count,
        "fallback_compression_streak": compressor._fallback_compression_streak,  # noqa: SLF001
        "compression_failure_cooldown_until_wall": cooldown_until_wall,
        "_last_touched": time.time(),
    }


def prune_stale_sessions(sessions: dict[str, Any], max_age_seconds: int = 6 * 60 * 60) -> dict[str, Any]:
    """Drop session entries whose state hasn't been touched in max_age_seconds
    — same bound as tool_guardrails_io.py's equivalent, for the same reason
    (sessions that never cleanly fire a Stop event shouldn't grow the state
    file forever)."""
    now = time.time()
    return {
        sid: entry
        for sid, entry in sessions.items()
        if now - entry.get("_last_touched", now) <= max_age_seconds
    }

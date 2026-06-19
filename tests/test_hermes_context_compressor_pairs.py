"""Smoke test for tool-pair safety + tail anchoring.

Origin: core/lib/hermes_adapted/context_compressor_pairs.py
        (ported from NousResearch/hermes-agent, MIT — fixes for incidents
        #10896 and #29824 in the original)
"""
from core.lib.hermes_adapted.context_compressor import CompressorConfig, ContextCompressor
from core.lib.hermes_adapted.context_compressor_pairs import (
    ensure_last_assistant_message_in_tail,
    ensure_last_user_message_in_tail,
    find_last_assistant_message_idx,
    find_last_user_message_idx,
    sanitize_tool_pairs,
)


def _msg(role, content=None, tool_calls=None, tool_call_id=None):
    m = {"role": role}
    if content is not None:
        m["content"] = content
    if tool_calls:
        m["tool_calls"] = tool_calls
    if tool_call_id:
        m["tool_call_id"] = tool_call_id
    return m


def test_find_last_user_message_idx():
    messages = [_msg("system", "s"), _msg("user", "a"), _msg("assistant", "b"), _msg("user", "c")]
    assert find_last_user_message_idx(messages, head_end=1) == 3


def test_find_last_assistant_message_idx_skips_tool_calls_only():
    messages = [
        _msg("user", "do thing"),
        _msg("assistant", None, tool_calls=[{"id": "1"}]),  # no text — skipped
        _msg("tool", "result", tool_call_id="1"),
    ]
    # No content-bearing assistant exists -> falls back to the tool-calls-only one
    assert find_last_assistant_message_idx(messages, head_end=0) == 1


def test_find_last_assistant_message_idx_prefers_content_bearing():
    messages = [
        _msg("assistant", "first reply"),
        _msg("user", "another question"),
        _msg("assistant", None, tool_calls=[{"id": "1"}]),
    ]
    assert find_last_assistant_message_idx(messages, head_end=0) == 0


def test_ensure_last_user_message_in_tail_pulls_cut_back():
    messages = [_msg("system", "s"), _msg("user", "old"), _msg("user", "ACTIVE TASK"), _msg("assistant", "x")]
    # cut_idx=3 would leave "ACTIVE TASK" (idx 2) in the compressed region
    new_cut = ensure_last_user_message_in_tail(messages, cut_idx=3, head_end=1)
    assert new_cut == 2


def test_ensure_last_user_message_in_tail_noop_when_already_in_tail():
    messages = [_msg("system", "s"), _msg("user", "a"), _msg("user", "b")]
    assert ensure_last_user_message_in_tail(messages, cut_idx=1, head_end=1) == 1


def test_ensure_last_assistant_message_in_tail_realigns_tool_group():
    messages = [
        _msg("user", "go"),
        _msg("assistant", None, tool_calls=[{"id": "1"}]),
        _msg("tool", "result", tool_call_id="1"),
        _msg("assistant", "final reply"),  # idx 3 — must stay in tail
    ]
    align = lambda msgs, idx: idx  # identity stand-in for _align_backward
    new_cut = ensure_last_assistant_message_in_tail(messages, cut_idx=4, head_end=0, align_backward=align)
    assert new_cut == 3


def test_sanitize_tool_pairs_removes_orphaned_result():
    messages = [_msg("user", "go"), _msg("tool", "stale result", tool_call_id="dead-call")]
    result = sanitize_tool_pairs(messages)
    assert all(m.get("role") != "tool" for m in result)


def test_sanitize_tool_pairs_stubs_missing_result():
    messages = [_msg("user", "go"), _msg("assistant", None, tool_calls=[{"id": "1"}])]
    result = sanitize_tool_pairs(messages)
    assert result[-1]["role"] == "tool"
    assert result[-1]["tool_call_id"] == "1"


def test_compress_keeps_last_user_message_out_of_summary():
    cc = ContextCompressor(
        context_length=2_000,
        cfg=CompressorConfig(threshold_percent=0.1, protect_first_n=1, protect_last_n=2),
        summarize_fn=lambda _p: "summary text",
    )
    messages = [_msg("system", "sys")]
    for i in range(20):
        messages.append(_msg("user", f"old message {i} " * 20))
        messages.append(_msg("assistant", f"old reply {i} " * 20))
    messages.append(_msg("user", "THE ACTIVE TASK RIGHT NOW"))

    result = cc.compress(messages, prompt_tokens=5_000)
    assert any("THE ACTIVE TASK RIGHT NOW" in str(m.get("content", "")) for m in result)

"""Smoke test for the ported context_compressor module.

Origin: core/lib/hermes_adapted/context_compressor.py
        (ported from NousResearch/hermes-agent, MIT)
"""
from core.lib.hermes_adapted.context_compressor import CompressorConfig, ContextCompressor


def _msg(role, content, tool_calls=None):
    m = {"role": role, "content": content}
    if tool_calls:
        m["tool_calls"] = tool_calls
    return m


def test_should_compress_respects_threshold():
    cc = ContextCompressor(context_length=10_000, cfg=CompressorConfig(threshold_percent=0.5))
    assert cc.should_compress(4_000) is False
    assert cc.should_compress(6_000) is True


def test_should_compress_anti_thrash_guard():
    cc = ContextCompressor(context_length=10_000)
    cc._last_savings_pct = [0.05, 0.05]
    assert cc.should_compress(9_000) is False


def test_prune_old_tool_results_dedupes_identical_content():
    cc = ContextCompressor(context_length=10_000)
    big = "x" * 300
    messages = [
        _msg("tool", big),
        _msg("user", "hi"),
        _msg("tool", big),
    ]
    # protect_tail_count == len(messages): nothing falls into the phase-2
    # "summarize old result" window, isolating phase-1 dedup behavior.
    pruned = cc._prune_old_tool_results(messages, protect_tail_count=len(messages))
    assert pruned[0]["content"] == "[Duplicate tool output — same content as a more recent call]"
    assert pruned[2]["content"] == big  # newest copy kept full


def test_compress_returns_unchanged_when_nothing_to_compress():
    cc = ContextCompressor(context_length=10_000)
    messages = [_msg("system", "sys"), _msg("user", "hi"), _msg("assistant", "hello")]
    result = cc.compress(messages, prompt_tokens=100)
    assert result == messages


def test_compress_inserts_summary_for_long_transcript():
    def fake_summarize(_prompt):
        return "Active Task: keep going"

    cc = ContextCompressor(
        context_length=2_000,
        cfg=CompressorConfig(threshold_percent=0.1, protect_first_n=1, protect_last_n=2),
        summarize_fn=fake_summarize,
    )
    messages = [_msg("system", "sys")]
    for i in range(20):
        messages.append(_msg("user", f"message number {i} " * 20))
        messages.append(_msg("assistant", f"reply number {i} " * 20))

    result = cc.compress(messages, prompt_tokens=5_000)
    assert len(result) < len(messages)
    assert any("Active Task" in str(m.get("content", "")) for m in result)
    assert cc.compression_count == 1


def test_compress_falls_back_to_static_summary_when_summarizer_fails():
    cc = ContextCompressor(
        context_length=2_000,
        cfg=CompressorConfig(threshold_percent=0.1, protect_first_n=1, protect_last_n=2),
        summarize_fn=lambda _p: None,
    )
    messages = [_msg("system", "sys")]
    for i in range(20):
        messages.append(_msg("user", f"message number {i} " * 20))

    result = cc.compress(messages, prompt_tokens=5_000)
    assert any("Summarizer unavailable" in str(m.get("content", "")) for m in result)

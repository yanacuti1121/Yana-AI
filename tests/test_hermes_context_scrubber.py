"""Smoke test for the ported context scrubber (split from memory_manager).

Origin: core/lib/hermes_adapted/context_scrubber.py
        (ported from NousResearch/hermes-agent, MIT)
"""
from core.lib.hermes_adapted.context_scrubber import (
    StreamingContextScrubber,
    build_memory_context_block,
    sanitize_context,
)


def test_sanitize_context_strips_memory_context_block():
    raw = "before <memory-context>\nsecret stuff\n</memory-context> after"
    assert sanitize_context(raw) == "before  after"


def test_build_memory_context_block_wraps_with_system_note():
    block = build_memory_context_block("user likes dark mode")
    assert block.startswith("<memory-context>")
    assert block.endswith("</memory-context>")
    assert "user likes dark mode" in block


def test_build_memory_context_block_empty_input_returns_empty():
    assert build_memory_context_block("   ") == ""


def test_streaming_scrubber_hides_span_split_across_chunks():
    # The scrubber only recognizes <memory-context> as a span opener when it
    # starts a block (beginning of stream, or right after a newline) — this
    # is the real, ported behavior, not a relaxed test: a tag appearing
    # mid-line is left alone by design (see _is_block_boundary).
    scrubber = StreamingContextScrubber()
    out1 = scrubber.feed("Hello\n<memory-context>\nsecr")
    out2 = scrubber.feed("et</memory-context>\nworld")
    assert "secret" not in (out1 + out2)
    assert "Hello" in out1
    assert "world" in out2


def test_streaming_scrubber_passes_through_normal_text():
    scrubber = StreamingContextScrubber()
    assert scrubber.feed("just normal text") == "just normal text"
    assert scrubber.flush() == ""

"""Smoke test for the ported memory_manager module.

Origin: core/lib/hermes_adapted/memory_manager.py
        (ported from NousResearch/hermes-agent, MIT)
"""
from core.lib.hermes_adapted.memory_manager import (
    MemoryManager,
    StreamingContextScrubber,
    build_memory_context_block,
    sanitize_context,
)


class _FakeProvider:
    def __init__(self, name, prefetch_result="", tools=None):
        self.name = name
        self._prefetch_result = prefetch_result
        self._tools = tools or []
        self.synced = []

    def prefetch(self, query, *, session_id=""):
        return self._prefetch_result

    def sync_turn(self, user_content, assistant_content, *, session_id=""):
        self.synced.append((user_content, assistant_content))

    def get_tool_schemas(self):
        return self._tools


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


def test_memory_manager_rejects_second_external_provider():
    mgr = MemoryManager()
    assert mgr.add_provider(_FakeProvider("provider-a")) is True
    assert mgr.add_provider(_FakeProvider("provider-b")) is False
    assert len(mgr.providers) == 1


def test_memory_manager_allows_builtin_alongside_external():
    mgr = MemoryManager()
    assert mgr.add_provider(_FakeProvider("provider-a")) is True
    assert mgr.add_provider(_FakeProvider("builtin")) is True
    assert len(mgr.providers) == 2


def test_memory_manager_rejects_reserved_tool_name():
    mgr = MemoryManager(reserved_tool_names={"terminal"})
    mgr.add_provider(_FakeProvider("provider-a", tools=[{"name": "terminal"}, {"name": "recall"}]))
    assert "terminal" not in mgr._tool_to_provider
    assert "recall" in mgr._tool_to_provider


def test_memory_manager_prefetch_all_merges_non_empty_results():
    mgr = MemoryManager()
    mgr.add_provider(_FakeProvider("a", prefetch_result="memory A"))
    mgr.add_provider(_FakeProvider("builtin", prefetch_result=""))
    assert mgr.prefetch_all("what do you remember?") == "memory A"


def test_memory_manager_sync_all_runs_in_background_and_drains_on_shutdown():
    mgr = MemoryManager()
    provider = _FakeProvider("a")
    mgr.add_provider(provider)
    mgr.sync_all("hi", "hello there")
    mgr.shutdown_all(timeout=2.0)
    assert provider.synced == [("hi", "hello there")]

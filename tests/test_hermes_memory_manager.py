"""Smoke test for the ported memory_manager module (+ lifecycle mixin).

Origin: core/lib/hermes_adapted/memory_manager.py
        core/lib/hermes_adapted/memory_manager_lifecycle.py
        (ported from NousResearch/hermes-agent, MIT)
"""
import json

from core.lib.hermes_adapted.memory_manager import MemoryManager


class _FakeProvider:
    def __init__(self, name, prefetch_result="", tools=None):
        self.name = name
        self._prefetch_result = prefetch_result
        self._tools = tools or []
        self.synced = []
        self.calls = []

    def prefetch(self, query, *, session_id=""):
        return self._prefetch_result

    def sync_turn(self, user_content, assistant_content, *, session_id=""):
        self.synced.append((user_content, assistant_content))

    def get_tool_schemas(self):
        return self._tools

    def handle_tool_call(self, tool_name, args, **kwargs):
        self.calls.append((tool_name, args))
        return json.dumps({"ok": True})

    def on_turn_start(self, turn_number, message, **kwargs):
        self.calls.append(("on_turn_start", turn_number))

    def on_session_end(self, messages):
        self.calls.append(("on_session_end", len(messages)))

    def on_session_switch(self, new_session_id, **kwargs):
        self.calls.append(("on_session_switch", new_session_id))

    def on_pre_compress(self, messages):
        return f"{self.name} context"

    def on_memory_write(self, action, target, content, metadata=None):
        self.calls.append(("on_memory_write", action, target))

    def on_delegation(self, task, result, **kwargs):
        self.calls.append(("on_delegation", task))


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


def test_handle_tool_call_routes_to_registered_provider():
    mgr = MemoryManager()
    provider = _FakeProvider("a", tools=[{"name": "recall"}])
    mgr.add_provider(provider)
    result = mgr.handle_tool_call("recall", {"q": "x"})
    assert json.loads(result) == {"ok": True}
    assert provider.calls == [("recall", {"q": "x"})]


def test_handle_tool_call_unknown_tool_returns_error_json():
    mgr = MemoryManager()
    result = mgr.handle_tool_call("nonexistent", {})
    assert "error" in json.loads(result)


def test_get_all_tool_schemas_dedupes_and_skips_reserved():
    mgr = MemoryManager(reserved_tool_names={"terminal"})
    mgr.add_provider(_FakeProvider("a", tools=[{"name": "terminal"}, {"name": "recall"}]))
    mgr.add_provider(_FakeProvider("builtin", tools=[{"name": "recall"}]))  # duplicate name
    schemas = mgr.get_all_tool_schemas()
    names = [s["name"] for s in schemas]
    assert names == ["recall"]  # terminal skipped, duplicate recall deduped


def test_on_turn_start_notifies_all_providers():
    mgr = MemoryManager()
    p1, p2 = _FakeProvider("a"), _FakeProvider("builtin")
    mgr.add_provider(p1)
    mgr.add_provider(p2)
    mgr.on_turn_start(3, "hello")
    assert ("on_turn_start", 3) in p1.calls
    assert ("on_turn_start", 3) in p2.calls


def test_on_pre_compress_merges_provider_context():
    mgr = MemoryManager()
    mgr.add_provider(_FakeProvider("a"))
    mgr.add_provider(_FakeProvider("builtin"))
    result = mgr.on_pre_compress([{"role": "user", "content": "hi"}])
    assert "a context" in result and "builtin context" in result


def test_on_memory_write_skips_builtin_provider():
    mgr = MemoryManager()
    builtin = _FakeProvider("builtin")
    external = _FakeProvider("a")
    mgr.add_provider(external)
    mgr.add_provider(builtin)
    mgr.on_memory_write("create", "note.md", "content")
    assert any(c[0] == "on_memory_write" for c in external.calls)
    assert not any(c[0] == "on_memory_write" for c in builtin.calls)


def test_on_delegation_notifies_providers():
    mgr = MemoryManager()
    provider = _FakeProvider("a")
    mgr.add_provider(provider)
    mgr.on_delegation("research task", "done")
    assert ("on_delegation", "research task") in provider.calls


def test_provider_failure_does_not_break_other_providers():
    class _BrokenProvider(_FakeProvider):
        def on_turn_start(self, turn_number, message, **kwargs):
            raise RuntimeError("boom")

    mgr = MemoryManager()
    broken = _BrokenProvider("a")
    healthy = _FakeProvider("builtin")
    mgr.add_provider(broken)
    mgr.add_provider(healthy)
    mgr.on_turn_start(1, "hi")  # must not raise
    assert ("on_turn_start", 1) in healthy.calls


def test_flush_pending_waits_for_queued_sync():
    mgr = MemoryManager()
    provider = _FakeProvider("a")
    mgr.add_provider(provider)
    mgr.sync_all("hi", "hello")
    assert mgr.flush_pending(timeout=2.0) is True
    assert provider.synced == [("hi", "hello")]

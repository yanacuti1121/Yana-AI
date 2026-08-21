"""Tests for the Claude-Code-specific adapter around memory_manager.py.

Origin: core/lib/hermes_adapted/memory_manager_io.py (new, not part of the port)

No pytest dependency required -- bare test_*() functions with assert, run
via the __main__ block at the bottom (`python3 tests/test_hermes_memory_manager_io.py`).
Also pytest-discoverable if pytest is installed, matching the naming
convention of test_hermes_context_compressor_io.py / test_hermes_tool_guardrails_io.py.
"""
import json
import os
import sys
import tempfile
import time
import urllib.error
from unittest import mock

from core.lib.hermes_adapted.memory_manager_io import (
    MAX_EMBEDDINGS_PER_PREFETCH,
    MAX_LOG_ENTRIES,
    MAX_TURN_TEXT_CHARS,
    MIN_SIMILARITY,
    STALE_LOG_SECONDS,
    LocalTurnLogProvider,
    embed_text,
    recall_for_prompt,
    sync_last_turn,
)
from core.lib.hermes_adapted import memory_manager_io as _mmio
from core.lib.hermes_adapted import mojo_vector_recall as _mvr


def _temp_log_path():
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False)
    f.close()
    return f.name


def _write_transcript(lines):
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False)
    for entry in lines:
        f.write(json.dumps(entry) + "\n")
    f.close()
    return f.name


def _read_log(path):
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def test_sync_turn_appends_one_entry():
    log_path = _temp_log_path()
    provider = LocalTurnLogProvider(log_path)
    provider.sync_turn("hello there", "hi, how can I help", session_id="s1")

    entries = _read_log(log_path)
    assert len(entries) == 1
    assert entries[0]["session_id"] == "s1"
    assert entries[0]["user_text"] == "hello there"
    assert entries[0]["assistant_text"] == "hi, how can I help"
    assert isinstance(entries[0]["timestamp"], float)


def test_sync_turn_truncates_oversized_content():
    log_path = _temp_log_path()
    provider = LocalTurnLogProvider(log_path)
    long_user = "a" * (MAX_TURN_TEXT_CHARS + 500)
    long_assistant = "b" * (MAX_TURN_TEXT_CHARS + 500)
    provider.sync_turn(long_user, long_assistant, session_id="s1")

    entries = _read_log(log_path)
    assert len(entries[0]["user_text"]) == MAX_TURN_TEXT_CHARS
    assert len(entries[0]["assistant_text"]) == MAX_TURN_TEXT_CHARS


def test_sync_turn_handles_empty_assistant_content():
    log_path = _temp_log_path()
    provider = LocalTurnLogProvider(log_path)
    provider.sync_turn("just a user message", "", session_id="s1")

    entries = _read_log(log_path)
    assert entries[0]["assistant_text"] == ""


def test_stub_methods_do_not_raise_and_return_documented_values():
    """prefetch() is real as of Phase 5b -- covered by its own tests below,
    not here."""
    provider = LocalTurnLogProvider(_temp_log_path())
    assert provider.get_tool_schemas() == []
    result = provider.handle_tool_call("anything", {})
    assert json.loads(result)["error"]  # returns a JSON error string, not a raise
    # None of these should raise:
    provider.on_turn_start(1, "msg")
    provider.on_session_end([])
    provider.on_session_switch("new-session")
    assert provider.on_pre_compress([]) == ""
    provider.on_memory_write("write", "target", "content")
    provider.on_delegation("task", "result")


def test_sync_last_turn_does_not_pair_current_question_with_a_stale_older_answer():
    """Regression test: the current turn's user message must not get paired
    with a content-bearing assistant reply from an EARLIER, unrelated turn
    just because the current turn's own assistant message has no text yet
    (e.g. a tool_use-only message, Stop fired mid-turn). Reproduces the bug
    where find_last_assistant_message_idx was called with head_end=0
    (search the whole transcript) instead of head_end=user_idx (search only
    from the current turn onward)."""
    transcript_path = _write_transcript([
        {"type": "user", "message": {"role": "user", "content": "first question"}},
        {"type": "assistant", "message": {"role": "assistant", "content": "first answer"}},
        {"type": "user", "message": {"role": "user", "content": "second question, unanswered so far"}},
        {"type": "assistant", "message": {"role": "assistant", "content": [
            {"type": "tool_use", "id": "toolu_1", "name": "Read", "input": {"path": "a.txt"}},
        ]}},
    ])
    log_path = _temp_log_path()

    result = sync_last_turn(transcript_path, "s1", log_path)
    assert result is True

    entries = _read_log(log_path)
    assert entries[0]["user_text"] == "second question, unanswered so far"
    # Must be empty (no reply captured yet), NOT "first answer" from the
    # earlier, unrelated turn.
    assert entries[0]["assistant_text"] == ""


def test_sync_turn_redacts_secret_like_content():
    log_path = _temp_log_path()
    provider = LocalTurnLogProvider(log_path)
    provider.sync_turn("my API_KEY is sk-abc123", "got it, noted", session_id="s1")

    entries = _read_log(log_path)
    assert "sk-abc123" not in entries[0]["user_text"]
    assert entries[0]["user_text"] == "[REDACTED — possible secret/credential]"
    assert entries[0]["assistant_text"] == "got it, noted"  # unaffected side stays untouched


def test_sync_turn_redacts_assistant_side_independently():
    log_path = _temp_log_path()
    provider = LocalTurnLogProvider(log_path)
    provider.sync_turn(
        "can you show me the token",
        "here is the bearer token: xyz789",
        session_id="s1",
    )

    entries = _read_log(log_path)
    # Both sides trip the pattern independently (user_text has "token" too),
    # so both get redacted -- this is expected, not a bug: the filter can't
    # know which side actually carries the sensitive value.
    assert entries[0]["user_text"] == "[REDACTED — possible secret/credential]"
    assert entries[0]["assistant_text"] == "[REDACTED — possible secret/credential]"


def test_sync_turn_does_not_redact_ordinary_content():
    log_path = _temp_log_path()
    provider = LocalTurnLogProvider(log_path)
    provider.sync_turn("fix the bug in freeze.ts", "found it, patched the timer wrap", session_id="s1")

    entries = _read_log(log_path)
    assert entries[0]["user_text"] == "fix the bug in freeze.ts"
    assert entries[0]["assistant_text"] == "found it, patched the timer wrap"


def test_sync_last_turn_picks_last_user_assistant_pair():
    transcript_path = _write_transcript([
        {"type": "user", "message": {"role": "user", "content": "first question"}},
        {"type": "assistant", "message": {"role": "assistant", "content": "first answer"}},
        {"type": "user", "message": {"role": "user", "content": "second question"}},
        {"type": "assistant", "message": {"role": "assistant", "content": "second answer"}},
    ])
    log_path = _temp_log_path()

    result = sync_last_turn(transcript_path, "session-abc", log_path)
    assert result is True

    entries = _read_log(log_path)
    assert len(entries) == 1
    assert entries[0]["user_text"] == "second question"
    assert entries[0]["assistant_text"] == "second answer"
    assert entries[0]["session_id"] == "session-abc"


def test_sync_last_turn_returns_false_on_missing_transcript():
    log_path = _temp_log_path()
    result = sync_last_turn("/nonexistent/path/does-not-exist.jsonl", "s1", log_path)
    assert result is False
    assert _read_log(log_path) == []


def test_sync_last_turn_returns_false_when_no_user_message_exists():
    transcript_path = _write_transcript([
        {"type": "assistant", "message": {"role": "assistant", "content": "only an assistant line"}},
    ])
    log_path = _temp_log_path()
    result = sync_last_turn(transcript_path, "s1", log_path)
    assert result is False
    assert _read_log(log_path) == []


def test_sync_last_turn_ignores_malformed_transcript_lines():
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False)
    f.write("{not valid json\n")
    f.write(json.dumps({"type": "user", "message": {"role": "user", "content": "ok question"}}) + "\n")
    f.close()
    log_path = _temp_log_path()

    result = sync_last_turn(f.name, "s1", log_path)
    assert result is True
    entries = _read_log(log_path)
    assert entries[0]["user_text"] == "ok question"
    assert entries[0]["assistant_text"] == ""


def test_log_pruning_drops_stale_entries():
    log_path = _temp_log_path()
    provider = LocalTurnLogProvider(log_path)
    provider.sync_turn("recent turn", "recent reply", session_id="s1")

    # Hand-craft a stale entry directly (older than STALE_LOG_SECONDS) and
    # write it under the real entry, simulating a log this old.
    entries = _read_log(log_path)
    entries.insert(0, {
        "session_id": "s0", "timestamp": time.time() - STALE_LOG_SECONDS - 10,
        "user_text": "ancient turn", "assistant_text": "ancient reply",
    })
    with open(log_path, "w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")

    # The next sync_turn call re-prunes the whole log as part of its
    # read-modify-write pass.
    provider.sync_turn("another recent turn", "another reply", session_id="s1")
    remaining = _read_log(log_path)
    assert all(e["user_text"] != "ancient turn" for e in remaining)
    assert any(e["user_text"] == "recent turn" for e in remaining)
    assert any(e["user_text"] == "another recent turn" for e in remaining)


def test_log_pruning_caps_total_entry_count():
    log_path = _temp_log_path()
    now = time.time()
    with open(log_path, "w", encoding="utf-8") as f:
        for i in range(MAX_LOG_ENTRIES + 10):
            f.write(json.dumps({
                "session_id": "s1", "timestamp": now,
                "user_text": f"turn {i}", "assistant_text": f"reply {i}",
            }) + "\n")

    provider = LocalTurnLogProvider(log_path)
    provider.sync_turn("newest turn", "newest reply", session_id="s1")

    remaining = _read_log(log_path)
    assert len(remaining) == MAX_LOG_ENTRIES
    # Oldest entries (lowest indices) must be the ones dropped, newest kept.
    assert remaining[-1]["user_text"] == "newest turn"
    assert remaining[0]["user_text"] != "turn 0"


# -----------------------------------------------------------------------
# Phase 5b -- recall (prefetch, embedding cache, cosine similarity)
# -----------------------------------------------------------------------

class _FakeUrlopenCtx:
    """Minimal context-manager stand-in for urllib.request.urlopen's return
    value -- just enough surface (.read(), __enter__/__exit__) for embed_text
    to consume."""

    def __init__(self, payload_bytes):
        self._payload = payload_bytes

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


def _ollama_response(embedding):
    return _FakeUrlopenCtx(json.dumps({"embedding": embedding}).encode("utf-8"))


def test_embed_text_parses_valid_response():
    with mock.patch.object(_mmio.urllib.request, "urlopen", return_value=_ollama_response([0.1, 0.2, 0.3])):
        result = embed_text("hello", "nomic-embed-text", "http://localhost:11434")
    assert result == [0.1, 0.2, 0.3]


def test_embed_text_returns_none_on_connection_error():
    with mock.patch.object(_mmio.urllib.request, "urlopen", side_effect=urllib.error.URLError("refused")):
        result = embed_text("hello", "nomic-embed-text", "http://localhost:11434")
    assert result is None


def test_embed_text_returns_none_on_malformed_response():
    with mock.patch.object(_mmio.urllib.request, "urlopen", return_value=_FakeUrlopenCtx(b"not json")):
        assert embed_text("hello", "nomic-embed-text", "http://localhost:11434") is None

    with mock.patch.object(_mmio.urllib.request, "urlopen", return_value=_ollama_response("not-a-list")):
        assert embed_text("hello", "nomic-embed-text", "http://localhost:11434") is None

    with mock.patch.object(_mmio.urllib.request, "urlopen", return_value=_ollama_response([])):
        assert embed_text("hello", "nomic-embed-text", "http://localhost:11434") is None


def test_cosine_similarity_identical_vectors_is_one():
    assert abs(_mmio._cosine_similarity([1.0, 2.0, 3.0], [1.0, 2.0, 3.0]) - 1.0) < 1e-9


def test_cosine_similarity_orthogonal_vectors_is_zero():
    assert abs(_mmio._cosine_similarity([1.0, 0.0], [0.0, 1.0])) < 1e-9


def test_cosine_similarity_mismatched_length_returns_zero():
    assert _mmio._cosine_similarity([1.0, 2.0], [1.0, 2.0, 3.0]) == 0.0


def test_cosine_similarity_zero_vector_returns_zero_not_nan():
    assert _mmio._cosine_similarity([0.0, 0.0], [1.0, 1.0]) == 0.0


def test_vector_batch_python_backend_matches_reference_scores():
    query = [1.0, 0.0, 0.0]
    candidates = [
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [1.0, 1.0, 0.0],
        [1.0, 0.0],
    ]
    with mock.patch.dict(os.environ, {_mvr._BACKEND_ENV: "python"}):
        _mvr._loaded_mode = None
        scores = _mvr.cosine_scores(query, candidates)

    expected = [_mvr.cosine_similarity(query, candidate) for candidate in candidates]
    assert scores == expected
    assert _mvr.backend_status()["active"] == "python"


def test_vector_batch_uses_one_mojo_call_for_all_candidates():
    calls = []

    def _fake_mojo(query, candidates):
        calls.append((query, candidates))
        return [_mvr.cosine_similarity(query, candidate) for candidate in candidates]

    candidates = [[1.0, 0.0], [0.0, 1.0], [0.5, 0.5]]
    with mock.patch.object(_mvr, "_load_mojo_backend", return_value=_fake_mojo):
        scores = _mvr.cosine_scores([1.0, 0.0], candidates)

    assert len(calls) == 1
    assert calls[0][1] == candidates
    assert scores[0] == 1.0
    assert scores[1] == 0.0


def test_vector_batch_falls_back_when_mojo_output_is_invalid():
    candidates = [[1.0, 0.0], [0.0, 1.0]]
    with mock.patch.object(
        _mvr, "_load_mojo_backend", return_value=lambda *args: [float("nan")]
    ):
        scores = _mvr.cosine_scores([1.0, 0.0], candidates)

    assert scores == [1.0, 0.0]
    assert _mvr.backend_status()["active"] == "python"


def test_vector_batch_falls_back_when_mojo_backend_raises():
    candidates = [[1.0, 0.0], [0.0, 1.0]]

    def _raising_mojo(*args):
        raise RuntimeError("simulated Mojo execution failure")

    with mock.patch.object(
        _mvr, "_load_mojo_backend", return_value=_raising_mojo
    ):
        scores = _mvr.cosine_scores([1.0, 0.0], candidates)

    status = _mvr.backend_status()
    assert scores == [1.0, 0.0]
    assert status["active"] == "python"
    assert "RuntimeError: simulated Mojo execution failure" in status["detail"]


def test_vector_batch_requested_mojo_falls_back_when_import_is_unavailable():
    with mock.patch.dict(os.environ, {_mvr._BACKEND_ENV: "mojo"}), mock.patch.dict(
        sys.modules, {"mojo": None}
    ):
        _mvr._loaded_mode = None
        scores = _mvr.cosine_scores([1.0, 0.0], [[1.0, 0.0]])

    assert scores == [1.0]
    assert _mvr.backend_status()["active"] == "python"
    assert "Mojo unavailable" in _mvr.backend_status()["detail"]


def _embed_side_effect(vectors_by_text):
    def _fn(text):
        for needle, vec in vectors_by_text.items():
            if needle in text:
                return vec
        return None
    return _fn


def test_prefetch_returns_empty_string_for_empty_query():
    provider = LocalTurnLogProvider(_temp_log_path())
    assert provider.prefetch("") == ""
    assert provider.prefetch("   ") == ""


def test_prefetch_returns_empty_when_ollama_unreachable():
    log_path = _temp_log_path()
    provider = LocalTurnLogProvider(log_path)
    provider.sync_turn("how do I fix the freeze bug", "patched timer wrap", session_id="s1")

    with mock.patch.object(_mmio, "embed_text", return_value=None):
        assert provider.prefetch("freeze bug") == ""


def test_prefetch_redacts_secret_like_query_before_embedding():
    """Security review (Phase 5b): the live query text must get the same
    redaction sync_turn() already applies to logged text before it leaves
    the process over the local Ollama call -- a raw secret typed as the
    current prompt should not be sent as-is, even to a loopback address."""
    log_path = _temp_log_path()
    provider = LocalTurnLogProvider(log_path)
    provider.sync_turn("unrelated turn", "unrelated reply", session_id="s1")

    seen_text = {}

    def _capture_embed(text, *a, **kw):
        if "REDACTED" in text or "unrelated" in text:
            seen_text.setdefault("query" if "REDACTED" in text else "turn", text)
        return [1.0, 0.0]

    with mock.patch.object(_mmio, "embed_text", side_effect=_capture_embed):
        provider.prefetch("here is my API_KEY sk-live-abc123")

    assert "query" in seen_text
    assert "sk-live-abc123" not in seen_text["query"]
    assert "[REDACTED" in seen_text["query"]


def test_prefetch_returns_top_match_above_threshold():
    log_path = _temp_log_path()
    provider = LocalTurnLogProvider(log_path)
    provider.sync_turn("how do I fix the timer freeze bug", "patched the timer wrap in freeze.ts", session_id="s1")
    provider.sync_turn("what's the weather like", "no idea, I can't check that", session_id="s1")

    query_vec = [1.0, 0.0, 0.0]
    relevant_vec = [0.99, 0.05, 0.0]     # near-identical to the query -> high similarity
    irrelevant_vec = [0.0, 0.0, 1.0]     # orthogonal -> zero similarity

    embed_fn = _embed_side_effect({
        "freeze bug question": query_vec,
        "timer freeze bug": relevant_vec,
        "weather": irrelevant_vec,
    })
    with mock.patch.object(_mmio, "embed_text", side_effect=lambda text, *a, **kw: embed_fn(text)):
        result = provider.prefetch("freeze bug question")

    assert "timer wrap" in result
    assert "weather" not in result


def test_prefetch_respects_min_similarity_threshold():
    log_path = _temp_log_path()
    provider = LocalTurnLogProvider(log_path, min_similarity=0.9)
    provider.sync_turn("completely unrelated turn", "completely unrelated reply", session_id="s1")

    query_vec = [1.0, 0.0]
    weakly_related_vec = [0.5, 0.5]  # cosine similarity well under 0.9

    embed_fn = _embed_side_effect({
        "my query": query_vec,
        "completely unrelated turn": weakly_related_vec,
    })
    with mock.patch.object(_mmio, "embed_text", side_effect=lambda text, *a, **kw: embed_fn(text)):
        result = provider.prefetch("my query")

    assert result == ""


def test_prefetch_backfill_is_rate_limited():
    log_path = _temp_log_path()
    cache_path = log_path + ".embeddings.jsonl"
    provider = LocalTurnLogProvider(log_path, embedding_cache_path=cache_path, max_backfill=2)

    for i in range(5):
        provider.sync_turn(f"turn {i}", f"reply {i}", session_id="s1")

    call_count = {"n": 0}

    def _counting_embed(text, *a, **kw):
        if text == "query":
            return [1.0, 0.0]
        call_count["n"] += 1
        return [1.0, 0.0]

    with mock.patch.object(_mmio, "embed_text", side_effect=_counting_embed):
        provider.prefetch("query")

    # 5 log entries but max_backfill=2 -- only 2 should have been embedded
    # in this call, not all 5.
    assert call_count["n"] == 2


def test_prefetch_backfill_rate_limit_holds_even_when_embeds_keep_failing():
    """Regression test: security review (Phase 5b) found the original
    implementation counted successful backfills, not attempts -- a hung
    (not merely down) Ollama server that returns None on every backfill
    call let the loop call embed_text on EVERY uncached log entry (up to
    MAX_LOG_ENTRIES) instead of stopping at max_backfill, defeating the
    whole point of the rate limit and blowing the documented worst-case
    latency budget. This seeds 10 log entries and makes every backfill
    call fail (query embed still succeeds) -- attempted-call count must
    stay capped at max_backfill regardless."""
    log_path = _temp_log_path()
    cache_path = log_path + ".embeddings.jsonl"
    provider = LocalTurnLogProvider(log_path, embedding_cache_path=cache_path, max_backfill=3)

    for i in range(10):
        provider.sync_turn(f"turn {i}", f"reply {i}", session_id="s1")

    call_count = {"n": 0}

    def _always_failing_embed(text, *a, **kw):
        if text == "query":
            return [1.0, 0.0]
        call_count["n"] += 1
        return None  # simulates a hung/unreachable Ollama on every backfill attempt

    with mock.patch.object(_mmio, "embed_text", side_effect=_always_failing_embed):
        result = provider.prefetch("query")

    # 10 uncached entries, all failing -- must stop at max_backfill=3
    # attempts, not try all 10.
    assert call_count["n"] == 3
    assert result == ""  # nothing got cached, so nothing to match against


def test_embedding_cache_prunes_orphaned_entries():
    log_path = _temp_log_path()
    cache_path = log_path + ".embeddings.jsonl"

    # A cache entry for a (session_id, timestamp) pair that does not exist
    # in the current log -- simulates a source entry that has since been
    # pruned from memory-turn-log.jsonl by _prune_entries.
    with open(cache_path, "w", encoding="utf-8") as f:
        f.write(json.dumps({"session_id": "gone", "timestamp": 111.0, "embedding": [1.0, 0.0]}) + "\n")

    cache = _mmio._sync_embedding_cache(cache_path, [], lambda text: None, max_backfill=0)
    assert cache == {}

    with open(cache_path, "r", encoding="utf-8") as f:
        remaining = [line for line in f if line.strip()]
    assert remaining == []


def test_recall_for_prompt_wraps_provider_via_memory_manager():
    log_path = _temp_log_path()
    cache_path = log_path + ".embeddings.jsonl"
    provider_for_setup = LocalTurnLogProvider(log_path)
    provider_for_setup.sync_turn("how do I deploy this", "run the deploy script", session_id="s1")

    query_vec = [1.0, 0.0]
    turn_vec = [0.95, 0.1]
    embed_fn = _embed_side_effect({"deploy question": query_vec, "deploy this": turn_vec})

    with mock.patch.object(_mmio, "embed_text", side_effect=lambda text, *a, **kw: embed_fn(text)):
        result = recall_for_prompt("deploy question", "s1", log_path, cache_path)

    assert "deploy script" in result


def _run_all():
    import sys
    tests = [(name, fn) for name, fn in globals().items() if name.startswith("test_")]
    failures = []
    for name, fn in tests:
        try:
            fn()
            print(f"PASS: {name}")
        except Exception as e:  # noqa: BLE001 -- test runner, report every failure
            failures.append((name, e))
            print(f"FAIL: {name}: {e}")
    print(f"\n{len(tests) - len(failures)}/{len(tests)} passed")
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    _run_all()

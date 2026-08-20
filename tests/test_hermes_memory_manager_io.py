"""Tests for the Claude-Code-specific adapter around memory_manager.py.

Origin: core/lib/hermes_adapted/memory_manager_io.py (new, not part of the port)

No pytest dependency required -- bare test_*() functions with assert, run
via the __main__ block at the bottom (`python3 tests/test_hermes_memory_manager_io.py`).
Also pytest-discoverable if pytest is installed, matching the naming
convention of test_hermes_context_compressor_io.py / test_hermes_tool_guardrails_io.py.
"""
import json
import tempfile
import time

from core.lib.hermes_adapted.memory_manager_io import (
    MAX_LOG_ENTRIES,
    MAX_TURN_TEXT_CHARS,
    STALE_LOG_SECONDS,
    LocalTurnLogProvider,
    sync_last_turn,
)


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
    provider = LocalTurnLogProvider(_temp_log_path())
    assert provider.prefetch("some query") == ""
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

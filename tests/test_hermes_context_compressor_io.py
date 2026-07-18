"""Tests for the Claude-Code-specific adapter around context_compressor.py.

Origin: core/lib/hermes_adapted/context_compressor_io.py (new, not part of the port)

No pytest dependency required — bare test_*() functions with assert, run
via the __main__ block at the bottom (`python3 tests/test_hermes_context_compressor_io.py`).
Also pytest-discoverable if pytest is installed, matching the naming
convention of test_hermes_tool_guardrails_io.py / test_hermes_context_scrubber.py.
"""
import json
import tempfile
import time

from core.lib.hermes_adapted.context_compressor_io import (
    dump_state,
    estimate_prompt_tokens,
    load_compressor,
    parse_transcript_to_messages,
    prune_stale_sessions,
)


def _write_transcript(lines):
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False)
    for entry in lines:
        f.write(json.dumps(entry) + "\n")
    f.close()
    return f.name


def test_parse_plain_text_user_and_assistant_turns():
    path = _write_transcript([
        {"type": "user", "message": {"role": "user", "content": "hello"}},
        {"type": "assistant", "message": {"role": "assistant", "content": "hi there"}},
    ])
    messages = parse_transcript_to_messages(path)
    assert messages == [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi there"},
    ]


def test_parse_assistant_text_and_tool_use_blocks():
    path = _write_transcript([
        {"type": "assistant", "message": {"role": "assistant", "content": [
            {"type": "text", "text": "let me check"},
            {"type": "tool_use", "id": "toolu_1", "name": "Read", "input": {"path": "a.txt"}},
        ]}},
    ])
    messages = parse_transcript_to_messages(path)
    assert len(messages) == 1
    m = messages[0]
    assert m["role"] == "assistant"
    assert m["content"] == "let me check"
    assert m["tool_calls"] == [{
        "id": "toolu_1", "type": "function",
        "function": {"name": "Read", "arguments": json.dumps({"path": "a.txt"})},
    }]


def test_parse_user_turn_with_tool_result_splits_into_text_and_tool_messages():
    path = _write_transcript([
        {"type": "user", "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "toolu_1", "content": "file contents here"},
            {"type": "text", "text": "and also please continue"},
        ]}},
    ])
    messages = parse_transcript_to_messages(path)
    # Order: text message first (from this adapter's construction order),
    # then the tool result — both must be present regardless of source order.
    roles = [m["role"] for m in messages]
    assert "user" in roles
    assert "tool" in roles
    tool_msg = next(m for m in messages if m["role"] == "tool")
    assert tool_msg["tool_call_id"] == "toolu_1"
    assert tool_msg["content"] == "file contents here"
    user_msg = next(m for m in messages if m["role"] == "user")
    assert user_msg["content"] == "and also please continue"


def test_parse_tool_result_with_list_content_joins_text_blocks():
    path = _write_transcript([
        {"type": "user", "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "toolu_2", "content": [
                {"type": "text", "text": "line one"},
                {"type": "text", "text": "line two"},
            ]},
        ]}},
    ])
    messages = parse_transcript_to_messages(path)
    assert messages == [{"role": "tool", "content": "line one\nline two", "tool_call_id": "toolu_2"}]


def test_parse_skips_lines_with_no_message_field():
    path = _write_transcript([
        {"type": "summary", "some_other_field": True},
        {"type": "user", "message": {"role": "user", "content": "real message"}},
    ])
    messages = parse_transcript_to_messages(path)
    assert messages == [{"role": "user", "content": "real message"}]


def test_parse_missing_file_returns_empty_list():
    assert parse_transcript_to_messages("/nonexistent/path/does-not-exist.jsonl") == []


def test_parse_malformed_json_line_is_skipped_not_fatal():
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False)
    f.write("{not valid json\n")
    f.write(json.dumps({"type": "user", "message": {"role": "user", "content": "ok"}}) + "\n")
    f.close()
    messages = parse_transcript_to_messages(f.name)
    assert messages == [{"role": "user", "content": "ok"}]


def test_estimate_prompt_tokens_counts_content_and_tool_call_arguments():
    messages = [
        {"role": "user", "content": "a" * 400},
        {"role": "assistant", "content": "", "tool_calls": [
            {"function": {"arguments": "b" * 40}},
        ]},
    ]
    # 400 + 40 = 440 chars, // 4 = 110
    assert estimate_prompt_tokens(messages) == 110


def test_load_dump_round_trip_preserves_state():
    compressor = load_compressor(None, context_length=1000, summarize_fn=lambda _p: "summary text")
    compressor._previous_summary = "prior summary"  # noqa: SLF001
    compressor._last_savings_pct = [0.2, 0.3]  # noqa: SLF001
    compressor.compression_count = 2

    dumped = dump_state(compressor)
    reloaded_raw = json.loads(json.dumps(dumped))
    reloaded = load_compressor(reloaded_raw, context_length=1000, summarize_fn=lambda _p: None)

    assert reloaded._previous_summary == "prior summary"  # noqa: SLF001
    assert reloaded._last_savings_pct == [0.2, 0.3]  # noqa: SLF001
    assert reloaded.compression_count == 2


def test_load_compressor_with_none_state_starts_fresh():
    compressor = load_compressor(None, context_length=1000, summarize_fn=lambda _p: None)
    assert compressor._previous_summary is None  # noqa: SLF001
    assert compressor._last_savings_pct == []  # noqa: SLF001
    assert compressor.compression_count == 0


def test_load_dump_round_trip_preserves_active_cooldown():
    """A cooldown set in one hook invocation must survive to the next —
    that's the entire point of the 2026-07-16 failure-cooldown addition
    (see context_compressor.py's module docstring)."""
    compressor = load_compressor(None, context_length=1000, summarize_fn=lambda _p: None)
    compressor._fallback_compression_streak = 3  # noqa: SLF001
    compressor._record_compression_failure_cooldown(120.0)  # noqa: SLF001

    dumped = dump_state(compressor)
    reloaded_raw = json.loads(json.dumps(dumped))  # simulates the process boundary
    reloaded = load_compressor(reloaded_raw, context_length=1000, summarize_fn=lambda _p: None)

    cooldown = reloaded.get_active_compression_failure_cooldown()
    assert cooldown is not None
    assert cooldown["fallback_streak"] == 3
    # Some real time elapses between dump and this immediate reload in the
    # test, so remaining must be close to but not exceed the original 120s —
    # proves the wall-clock deadline was preserved, not just re-armed fresh.
    assert 0 < cooldown["remaining_seconds"] <= 120.0


def test_load_dump_round_trip_with_no_cooldown_stays_clear():
    compressor = load_compressor(None, context_length=1000, summarize_fn=lambda _p: None)
    dumped = dump_state(compressor)
    reloaded_raw = json.loads(json.dumps(dumped))
    reloaded = load_compressor(reloaded_raw, context_length=1000, summarize_fn=lambda _p: None)
    assert reloaded.get_active_compression_failure_cooldown() is None
    assert reloaded._fallback_compression_streak == 0  # noqa: SLF001


def test_assert_compressor_shape_raises_on_missing_attribute():
    compressor = load_compressor(None, context_length=1000, summarize_fn=lambda _p: None)
    delattr(compressor, "compression_count")
    try:
        dump_state(compressor)
        assert False, "expected RuntimeError for a missing compressor attribute"
    except RuntimeError as e:
        assert "compression_count" in str(e)


def test_prune_stale_sessions_respects_custom_max_age():
    now = time.time()
    sessions = {"recent": {"_last_touched": now - 10}}
    assert prune_stale_sessions(sessions, max_age_seconds=5) == {}


def test_prune_stale_sessions_keeps_entries_missing_the_timestamp():
    sessions = {"legacy": {}}
    assert "legacy" in prune_stale_sessions(sessions)


def _run_all():
    import sys
    tests = [(name, fn) for name, fn in globals().items() if name.startswith("test_")]
    failures = []
    for name, fn in tests:
        try:
            fn()
            print(f"PASS: {name}")
        except Exception as e:  # noqa: BLE001 — test runner, report every failure
            failures.append((name, e))
            print(f"FAIL: {name}: {e}")
    print(f"\n{len(tests) - len(failures)}/{len(tests)} passed")
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    _run_all()

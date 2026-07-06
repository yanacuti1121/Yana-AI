"""Tests for the Claude-Code-specific adapter around tool_guardrails.py.

Origin: core/lib/hermes_adapted/tool_guardrails_io.py (new, not part of the port)
"""
import json
import time

from core.lib.hermes_adapted.tool_guardrails import ToolCallGuardrailController
from core.lib.hermes_adapted.tool_guardrails_io import (
    YANA_IDEMPOTENT_TOOLS,
    YANA_MUTATING_TOOLS,
    derive_failed,
    dump_state,
    load_controller,
    prune_stale_sessions,
)


def test_tool_name_sets_classify_read_and_bash_correctly():
    assert "Read" in YANA_IDEMPOTENT_TOOLS
    assert "Grep" in YANA_IDEMPOTENT_TOOLS
    assert "Bash" in YANA_MUTATING_TOOLS
    assert "Edit" in YANA_MUTATING_TOOLS
    assert YANA_IDEMPOTENT_TOOLS.isdisjoint(YANA_MUTATING_TOOLS)


def test_derive_failed_from_bash_nonzero_exit_code():
    assert derive_failed("Bash", {"exit_code": 1}) is True


def test_derive_failed_from_bash_zero_exit_code():
    assert derive_failed("Bash", {"exit_code": 0}) is False


def test_derive_failed_from_is_error_flag():
    assert derive_failed("Read", {"is_error": True}) is True
    assert derive_failed("Read", {"is_error": False}) is False


def test_derive_failed_falls_back_to_classify_tool_failure_on_string():
    assert derive_failed("Read", "Error: file not found") is True
    assert derive_failed("Read", "here is the file content") is False


def test_derive_failed_returns_none_for_unrecognized_shape():
    assert derive_failed("Bash", 12345) is None


def test_load_dump_round_trip_preserves_counts():
    controller = load_controller(None)
    # Drive real failures through the public API so the state has real content.
    for _ in range(2):
        controller.after_call("Bash", {"command": "flaky"}, "Error: boom", failed=True)

    dumped = dump_state(controller)
    assert dumped["exact_failure_counts"]
    # JSON round-trip, same as what the hook script actually does.
    reloaded_raw = json.loads(json.dumps(dumped))
    reloaded = load_controller(reloaded_raw)

    re_dumped = dump_state(reloaded)
    # _last_touched is a fresh timestamp each dump_state() call, not part of
    # the controller's actual restored state — compare everything else.
    assert {k: v for k, v in re_dumped.items() if k != "_last_touched"} == {
        k: v for k, v in dumped.items() if k != "_last_touched"
    }


def test_round_trip_empty_state_is_a_no_op():
    controller = load_controller({})
    dumped = dump_state(controller)
    assert dumped["exact_failure_counts"] == {}
    assert dumped["same_tool_failure_counts"] == {}
    assert dumped["no_progress"] == {}
    assert isinstance(dumped["_last_touched"], float)


def test_repeated_identical_failure_triggers_warn_after_round_trip():
    controller = load_controller(None)
    controller.after_call("Bash", {"command": "flaky"}, "Error: boom", failed=True)
    state = dump_state(controller)

    controller2 = load_controller(state)
    decision = controller2.after_call("Bash", {"command": "flaky"}, "Error: boom", failed=True)

    assert decision.action == "warn"
    assert decision.code == "repeated_exact_failure_warning"


def test_prune_stale_sessions_drops_only_old_entries():
    now = time.time()
    sessions = {
        "fresh": {"_last_touched": now},
        "stale": {"_last_touched": now - 7 * 60 * 60},  # 7h ago, past the 6h window
    }
    pruned = prune_stale_sessions(sessions)
    assert "fresh" in pruned
    assert "stale" not in pruned


def test_prune_stale_sessions_keeps_entries_missing_the_timestamp():
    # A session dumped before this field existed, or any malformed entry —
    # treat as "just touched" rather than immediately evicting it.
    sessions = {"legacy": {}}
    assert "legacy" in prune_stale_sessions(sessions)


def test_prune_stale_sessions_respects_custom_max_age():
    now = time.time()
    sessions = {"recent": {"_last_touched": now - 10}}
    assert prune_stale_sessions(sessions, max_age_seconds=5) == {}


def test_assert_controller_shape_raises_on_missing_attribute():
    controller = load_controller(None)
    delattr(controller, "_no_progress")
    try:
        dump_state(controller)
        assert False, "expected RuntimeError for a missing controller attribute"
    except RuntimeError as e:
        assert "_no_progress" in str(e)


def test_load_controller_still_works_on_a_fresh_class_instance():
    # Sanity check that _assert_controller_shape doesn't false-positive on a
    # normal, never-touched controller straight from the ported class.
    controller = ToolCallGuardrailController()
    assert hasattr(controller, "_exact_failure_counts")

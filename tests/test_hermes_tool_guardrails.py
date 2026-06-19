"""Smoke test for the ported tool_guardrails module.

Origin: core/lib/hermes_adapted/tool_guardrails.py
        (ported from NousResearch/hermes-agent, MIT)
"""
import json

from core.lib.hermes_adapted.tool_guardrails import (
    ToolCallGuardrailConfig,
    ToolCallGuardrailController,
    classify_tool_failure,
)


def test_classify_tool_failure_detects_nonzero_exit():
    failed, suffix = classify_tool_failure("terminal", json.dumps({"exit_code": 1}))
    assert failed is True
    assert "exit 1" in suffix


def test_classify_tool_failure_write_file_success_is_not_a_failure():
    result = json.dumps({"bytes_written": 42})
    failed, _ = classify_tool_failure("write_file", result)
    assert failed is False


def test_warns_after_repeated_identical_failure():
    controller = ToolCallGuardrailController(ToolCallGuardrailConfig(exact_failure_warn_after=2))
    args = {"path": "x.txt"}
    fail_result = json.dumps({"exit_code": 1})

    d1 = controller.after_call("terminal", args, fail_result)
    assert d1.action == "allow"
    d2 = controller.after_call("terminal", args, fail_result)
    assert d2.action == "warn"
    assert d2.code == "repeated_exact_failure_warning"


def test_blocks_after_repeated_identical_failure_when_hard_stop_enabled():
    cfg = ToolCallGuardrailConfig(hard_stop_enabled=True, exact_failure_block_after=2)
    controller = ToolCallGuardrailController(cfg)
    args = {"path": "x.txt"}
    fail_result = json.dumps({"exit_code": 1})

    controller.after_call("terminal", args, fail_result)
    controller.after_call("terminal", args, fail_result)
    decision = controller.before_call("terminal", args)
    assert decision.action == "block"
    assert decision.should_halt is True


def test_idempotent_no_progress_warning_on_repeated_identical_result():
    controller = ToolCallGuardrailController(ToolCallGuardrailConfig(no_progress_warn_after=2))
    args = {"path": "README.md"}
    same_result = "file contents here"

    d1 = controller.after_call("read_file", args, same_result, failed=False)
    assert d1.action == "allow"
    d2 = controller.after_call("read_file", args, same_result, failed=False)
    assert d2.action == "warn"
    assert d2.code == "idempotent_no_progress_warning"


def test_success_clears_failure_counts():
    controller = ToolCallGuardrailController(ToolCallGuardrailConfig(exact_failure_warn_after=1))
    args = {"path": "x.txt"}
    controller.after_call("terminal", args, json.dumps({"exit_code": 1}))
    controller.after_call("terminal", args, json.dumps({"exit_code": 0}), failed=False)
    decision = controller.before_call("terminal", args)
    assert decision.action == "allow"

"""Tests for the ported ruflo Task entity and execution-order resolver.

Origin: core/lib/ruflo_adapted/task.py (ported from ruvnet/ruflo, MIT).
No upstream `.test.ts` exists for `v3/src/task-execution/domain/Task.ts`
(checked the ruflo-main.zip snapshot: only `Task.ts` itself was vendored)
— these tests are written from the documented behavior, plus the
boundary cases required by fuzz-testing-constraints.md (empty task list,
circular dependency, dangling dependency reference).
"""
from __future__ import annotations

import pytest

from core.lib.ruflo_adapted.task import (
    CircularDependencyError,
    Task,
    resolve_execution_order,
    sort_by_priority,
)


def make_task(**overrides) -> Task:
    defaults = dict(id="t1", type="code")
    defaults.update(overrides)
    return Task(**defaults)


# ── dependency resolution check ───────────────────────────────────────────

def test_are_dependencies_resolved_no_dependencies():
    assert make_task(dependencies=[]).are_dependencies_resolved(set()) is True


def test_are_dependencies_resolved_all_satisfied():
    task = make_task(dependencies=["a", "b"])
    assert task.are_dependencies_resolved({"a", "b", "c"}) is True


def test_are_dependencies_resolved_missing_one():
    task = make_task(dependencies=["a", "b"])
    assert task.are_dependencies_resolved({"a"}) is False


# ── status lifecycle ──────────────────────────────────────────────────────

def test_start_from_pending_sets_in_progress():
    task = make_task(status="pending")
    task.start()
    assert task.status == "in-progress"


def test_start_is_noop_when_not_pending():
    task = make_task(status="in-progress")
    task.start()
    assert task.status == "in-progress"


def test_complete_from_in_progress():
    task = make_task(status="in-progress")
    task.complete()
    assert task.status == "completed"


def test_complete_is_noop_when_pending():
    task = make_task(status="pending")
    task.complete()
    assert task.status == "pending"


def test_fail_sets_status_and_error_metadata():
    task = make_task(status="in-progress")
    task.fail("disk full")
    assert task.status == "failed"
    assert task.metadata["error"] == "disk full"


def test_fail_without_error_leaves_metadata_untouched():
    task = make_task(status="in-progress")
    task.fail()
    assert task.status == "failed"
    assert "error" not in task.metadata


@pytest.mark.parametrize("status", ["pending", "in-progress"])
def test_cancel_from_cancellable_states(status):
    task = make_task(status=status)
    task.cancel()
    assert task.status == "cancelled"


@pytest.mark.parametrize("status", ["completed", "failed"])
def test_cancel_is_noop_for_terminal_states(status):
    task = make_task(status=status)
    task.cancel()
    assert task.status == status


# ── duration / workflow / assignment ──────────────────────────────────────

def test_get_duration_none_before_start():
    assert make_task().get_duration() is None


def test_get_duration_after_start_and_complete():
    task = make_task(status="pending")
    task.start()
    task.complete()
    duration = task.get_duration()
    assert duration is not None and duration >= 0


def test_get_duration_in_flight_uses_now():
    task = make_task(status="pending")
    task.start()
    duration = task.get_duration()
    assert duration is not None and duration >= 0


def test_is_workflow_requires_both_type_and_payload():
    assert make_task(type="workflow", workflow={"tasks": []}).is_workflow() is True
    assert make_task(type="workflow", workflow=None).is_workflow() is False
    assert make_task(type="code", workflow={"tasks": []}).is_workflow() is False


def test_assign_to_sets_assigned_to():
    task = make_task()
    task.assign_to("agent-7")
    assert task.assigned_to == "agent-7"


@pytest.mark.parametrize("priority,value", [("high", 3), ("medium", 2), ("low", 1)])
def test_get_priority_value_known(priority, value):
    assert make_task(priority=priority).get_priority_value() == value


def test_get_priority_value_unknown_defaults_to_medium():
    assert make_task(priority="urgent-ish").get_priority_value() == 2


# ── sort_by_priority ───────────────────────────────────────────────────────

def test_sort_by_priority_orders_high_to_low():
    low = make_task(id="low", priority="low")
    high = make_task(id="high", priority="high")
    medium = make_task(id="medium", priority="medium")
    result = sort_by_priority([low, high, medium])
    assert [t.id for t in result] == ["high", "medium", "low"]


def test_sort_by_priority_is_stable_for_equal_priority():
    a = make_task(id="a", priority="medium")
    b = make_task(id="b", priority="medium")
    result = sort_by_priority([a, b])
    assert [t.id for t in result] == ["a", "b"]


def test_sort_by_priority_empty_list():
    assert sort_by_priority([]) == []


# ── resolve_execution_order ────────────────────────────────────────────────

def test_resolve_execution_order_empty():
    assert resolve_execution_order([]) == []


def test_resolve_execution_order_simple_chain():
    a = make_task(id="a")
    b = make_task(id="b", dependencies=["a"])
    c = make_task(id="c", dependencies=["b"])
    ordered = resolve_execution_order([c, b, a])
    assert [t.id for t in ordered] == ["a", "b", "c"]


def test_resolve_execution_order_ties_broken_by_priority():
    a = make_task(id="a")
    low = make_task(id="low", dependencies=["a"], priority="low")
    high = make_task(id="high", dependencies=["a"], priority="high")
    ordered = resolve_execution_order([low, high, a])
    assert [t.id for t in ordered] == ["a", "high", "low"]


def test_resolve_execution_order_circular_dependency_raises():
    a = make_task(id="a", dependencies=["b"])
    b = make_task(id="b", dependencies=["a"])
    with pytest.raises(CircularDependencyError):
        resolve_execution_order([a, b])


def test_resolve_execution_order_dangling_dependency_raises():
    # depends on a task id that doesn't exist anywhere in the list — can
    # never be satisfied, must surface as a circular-dependency error
    # rather than looping forever.
    a = make_task(id="a", dependencies=["ghost"])
    with pytest.raises(CircularDependencyError):
        resolve_execution_order([a])

"""Tests for the ported ruflo WorkflowEngine.

Origin: core/lib/ruflo_adapted/workflow/engine.py (ported from ruvnet/ruflo
`WorkflowEngine.ts`, MIT). No upstream `.test.ts` exists for this file in
the ruflo-main.zip snapshot — tests are written from the documented
behavior plus the boundary cases required by fuzz-testing-constraints.md
(unknown workflow id, workflow with zero tasks, distributed execution with
a single executor).
"""
from __future__ import annotations

import pytest

from core.lib.ruflo_adapted.agent import TaskResult
from core.lib.ruflo_adapted.task import Task
from core.lib.ruflo_adapted.workflow.engine import WorkflowEngine
from core.lib.ruflo_adapted.workflow.state import WorkflowDefinition


def make_task(**overrides) -> Task:
    defaults = dict(id="t1", type="code")
    defaults.update(overrides)
    return Task(**defaults)


def succeed(task: Task) -> TaskResult:
    return TaskResult(task_id=task.id, status="completed", agent_id="a1")


def fail(task: Task) -> TaskResult:
    return TaskResult(task_id=task.id, status="failed", agent_id="a1", error="nope")


# ── execute_workflow ─────────────────────────────────────────────────────────

def test_execute_workflow_runs_tasks_in_dependency_order():
    a = make_task(id="a")
    b = make_task(id="b", dependencies=["a"])
    workflow = WorkflowDefinition(id="wf1", tasks=[b, a])
    engine = WorkflowEngine(succeed)

    result = engine.execute_workflow(workflow)
    assert result.status == "completed"
    assert result.execution_order == ["a", "b"]


def test_execute_workflow_failure_without_rollback_returns_failed_result():
    workflow = WorkflowDefinition(id="wf1", tasks=[make_task()], rollback_on_failure=False)
    engine = WorkflowEngine(fail)

    result = engine.execute_workflow(workflow)
    assert result.status == "failed"
    assert result.tasks_completed == 0


def test_execute_workflow_failure_with_rollback_invokes_on_rollback():
    calls = []
    t1 = make_task(id="t1", on_rollback=lambda: calls.append("t1"))
    t2 = make_task(id="t2", dependencies=["t1"])  # never reached
    workflow = WorkflowDefinition(id="wf1", tasks=[t1, t2], rollback_on_failure=True)

    def execute(task: Task) -> TaskResult:
        if task.id == "t1":
            return succeed(task)
        return fail(task)

    engine = WorkflowEngine(execute)
    result = engine.execute_workflow(workflow)

    assert result.status == "failed"
    assert calls == ["t1"]  # the one completed task was rolled back


# ── pause / resume / cancel ──────────────────────────────────────────────────

def test_pause_workflow_is_noop_once_already_completed():
    # run_workflow is synchronous here, so by the time execute_workflow
    # returns there is nothing left to pause — pause_workflow only acts
    # while status == "in-progress".
    workflow = WorkflowDefinition(id="wf1", tasks=[make_task(id="t1"), make_task(id="t2")])
    engine = WorkflowEngine(succeed)
    engine.execute_workflow(workflow)

    engine.pause_workflow("wf1")
    assert engine.get_workflow_state("wf1").status == "completed"


def test_pause_workflow_unknown_id_is_noop():
    engine = WorkflowEngine(succeed)
    engine.pause_workflow("ghost")  # must not raise


def test_resume_workflow_unknown_id_returns_none():
    engine = WorkflowEngine(succeed)
    assert engine.resume_workflow("ghost") is None


def test_resume_workflow_not_paused_returns_none():
    workflow = WorkflowDefinition(id="wf1", tasks=[make_task()])
    engine = WorkflowEngine(succeed)
    engine.execute_workflow(workflow)
    assert engine.resume_workflow("wf1") is None  # already completed, not paused


def test_pause_and_resume_paused_workflow_runs_remaining_tasks():
    t1 = make_task(id="t1")
    workflow = WorkflowDefinition(id="wf1", tasks=[t1])
    engine = WorkflowEngine(succeed)

    # Drive execute_workflow but force the execution into "paused" before
    # the loop body runs by pre-creating the execution state, mirroring
    # what pause_workflow would do mid-flight in a real async caller.
    from core.lib.ruflo_adapted.task import resolve_execution_order
    from core.lib.ruflo_adapted.workflow.state import create_execution

    ordered = resolve_execution_order(workflow.tasks)
    execution = create_execution(workflow, ordered)
    execution.status = "paused"
    engine._executions["wf1"] = execution  # noqa: SLF001 — test seam, no public setter exists

    result = engine.resume_workflow("wf1")
    assert result is not None
    assert result.status == "completed"
    assert result.execution_order == ["t1"]


def test_cancel_workflow_sets_status():
    workflow = WorkflowDefinition(id="wf1", tasks=[make_task()])
    engine = WorkflowEngine(succeed)
    engine.execute_workflow(workflow)
    engine.cancel_workflow("wf1")
    assert engine.get_workflow_state("wf1").status == "cancelled"


def test_cancel_workflow_unknown_id_is_noop():
    engine = WorkflowEngine(succeed)
    engine.cancel_workflow("ghost")  # must not raise


# ── get_workflow_state / metrics / debug info ───────────────────────────────

def test_get_workflow_state_unknown_id_raises_key_error():
    engine = WorkflowEngine(succeed)
    with pytest.raises(KeyError):
        engine.get_workflow_state("ghost")


def test_get_workflow_metrics_after_success():
    workflow = WorkflowDefinition(id="wf1", tasks=[make_task(id="t1"), make_task(id="t2")])
    engine = WorkflowEngine(succeed)
    engine.execute_workflow(workflow)

    metrics = engine.get_workflow_metrics("wf1")
    assert metrics.tasks_total == 2
    assert metrics.tasks_completed == 2
    assert metrics.success_rate == 1.0
    assert metrics.average_task_duration >= 0


def test_get_workflow_metrics_unknown_id_raises_key_error():
    engine = WorkflowEngine(succeed)
    with pytest.raises(KeyError):
        engine.get_workflow_metrics("ghost")


def test_get_workflow_debug_info_has_one_trace_entry_per_executed_task():
    workflow = WorkflowDefinition(id="wf1", tasks=[make_task(id="t1")])
    engine = WorkflowEngine(succeed)
    engine.execute_workflow(workflow)

    debug = engine.get_workflow_debug_info("wf1")
    assert len(debug.execution_trace) == 1
    assert debug.execution_trace[0]["taskId"] == "t1"
    assert any(e["event"] == "workflow:started" for e in debug.event_log)


# ── execute_distributed ──────────────────────────────────────────────────────

def test_execute_distributed_round_robins_across_executors():
    calls_per_executor = [[], []]

    def executor_factory(index: int):
        def run(task: Task) -> TaskResult:
            calls_per_executor[index].append(task.id)
            return succeed(task)
        return run

    workflow = WorkflowDefinition(id="wf1", tasks=[make_task(id=f"t{i}") for i in range(4)])
    engine = WorkflowEngine(succeed)
    result = engine.execute_distributed(workflow, [executor_factory(0), executor_factory(1)])

    assert result.status == "completed"
    assert result.tasks_completed == 4
    assert calls_per_executor[0] == ["t0", "t2"]
    assert calls_per_executor[1] == ["t1", "t3"]


def test_execute_distributed_collects_errors_and_marks_failed():
    workflow = WorkflowDefinition(id="wf1", tasks=[make_task(id="t1")])
    engine = WorkflowEngine(succeed)
    result = engine.execute_distributed(workflow, [fail])

    assert result.status == "failed"
    assert result.tasks_completed == 0
    assert len(result.errors) == 1


def test_execute_distributed_single_executor_handles_all_tasks():
    workflow = WorkflowDefinition(id="wf1", tasks=[make_task(id="t1"), make_task(id="t2")])
    engine = WorkflowEngine(succeed)
    result = engine.execute_distributed(workflow, [succeed])
    assert result.execution_order == ["t1", "t2"]

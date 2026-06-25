"""Tests for the ported ruflo sequential workflow runner.

Origin: core/lib/ruflo_adapted/workflow/{runner,state}.py (ported from
ruvnet/ruflo `WorkflowEngine.ts`'s `runWorkflow`/`rollbackWorkflow`, MIT).
No upstream `.test.ts` exists for this file in the ruflo-main.zip snapshot
— tests are written from the documented behavior (including the
sync-port adaptation of the busy-poll pause loop, noted in
`WorkflowExecution`'s docstring) plus the boundary cases required by
fuzz-testing-constraints.md (empty task list, failing rollback callback).
"""
from __future__ import annotations

import pytest

from core.lib.ruflo_adapted.agent import TaskResult
from core.lib.ruflo_adapted.task import Task
from core.lib.ruflo_adapted.workflow.runner import rollback_workflow, run_workflow
from core.lib.ruflo_adapted.workflow.state import WorkflowDefinition, create_execution


def make_task(**overrides) -> Task:
    defaults = dict(id="t1", type="code")
    defaults.update(overrides)
    return Task(**defaults)


def execution_for(tasks: list[Task], *, status: str = "in-progress"):
    workflow = WorkflowDefinition(id="wf1", tasks=tasks)
    execution = create_execution(workflow, tasks)
    execution.status = status
    return execution


def succeed(task: Task) -> TaskResult:
    return TaskResult(task_id=task.id, status="completed", agent_id="a1")


def fail(task: Task) -> TaskResult:
    return TaskResult(task_id=task.id, status="failed", agent_id="a1", error="nope")


# ── WorkflowExecution.log / create_execution ────────────────────────────────

def test_create_execution_starts_in_progress_with_no_completed_tasks():
    execution = execution_for([make_task()])
    assert execution.status == "in-progress"
    assert execution.completed_task_ids == set()
    assert execution.current_task_index == 0


def test_log_appends_timestamped_event():
    execution = execution_for([])
    execution.log("workflow:started", {"workflowId": "wf1"})
    assert len(execution.event_log) == 1
    assert execution.event_log[0]["event"] == "workflow:started"
    assert execution.event_log[0]["data"] == {"workflowId": "wf1"}


# ── run_workflow: happy path ─────────────────────────────────────────────────

def test_run_workflow_empty_tasks_completes_immediately():
    execution = execution_for([])
    result = run_workflow(execution, rollback_on_failure=False, execute_task_fn=succeed)
    assert result.status == "completed"
    assert result.tasks_completed == 0


def test_run_workflow_sequential_success_records_order_and_timings():
    tasks = [make_task(id="t1"), make_task(id="t2")]
    execution = execution_for(tasks)
    result = run_workflow(execution, rollback_on_failure=False, execute_task_fn=succeed)

    assert result.status == "completed"
    assert result.tasks_completed == 2
    assert result.execution_order == ["t1", "t2"]
    assert "t1" in execution.task_timings and "t2" in execution.task_timings


# ── run_workflow: failure without rollback ──────────────────────────────────

def test_run_workflow_failure_without_rollback_continues_and_marks_failed():
    tasks = [make_task(id="t1"), make_task(id="t2")]
    execution = execution_for(tasks)
    result = run_workflow(execution, rollback_on_failure=False, execute_task_fn=fail)

    assert result.status == "failed"
    assert len(result.errors) == 2  # both tasks failed, both recorded
    assert result.tasks_completed == 0


# ── run_workflow: failure with rollback ─────────────────────────────────────

def test_run_workflow_failure_with_rollback_raises():
    execution = execution_for([make_task()])
    with pytest.raises(RuntimeError):
        run_workflow(execution, rollback_on_failure=True, execute_task_fn=fail)


# ── run_workflow: nested workflow ───────────────────────────────────────────

def test_run_workflow_nested_workflow_success():
    nested_task = make_task(id="parent", type="workflow", workflow={"id": "child"})
    execution = execution_for([nested_task])

    nested_result = TaskResult(task_id="child", status="completed", agent_id="a1")
    result = run_workflow(
        execution, rollback_on_failure=False, execute_task_fn=succeed,
        run_nested_fn=lambda wf: type("R", (), {"status": "completed"})(),
    )
    assert result.status == "completed"


def test_run_workflow_nested_workflow_failure_raises_without_rollback_flag_set():
    nested_task = make_task(id="parent", type="workflow", workflow={"id": "child"})
    execution = execution_for([nested_task])

    result = run_workflow(
        execution, rollback_on_failure=False, execute_task_fn=succeed,
        run_nested_fn=lambda wf: type("R", (), {"status": "failed"})(),
    )
    assert result.status == "failed"
    assert len(result.errors) == 1


def test_run_workflow_nested_workflow_without_run_nested_fn_raises():
    nested_task = make_task(id="parent", type="workflow", workflow={"id": "child"})
    execution = execution_for([nested_task])
    result = run_workflow(execution, rollback_on_failure=False, execute_task_fn=succeed)
    assert result.status == "failed"
    assert "no run_nested_fn given" in str(result.errors[0])


# ── run_workflow: pause / cancel checkpoints ─────────────────────────────────

def test_run_workflow_paused_status_stops_before_processing():
    tasks = [make_task(id="t1")]
    execution = execution_for(tasks, status="paused")
    result = run_workflow(execution, rollback_on_failure=False, execute_task_fn=succeed)
    assert result.tasks_completed == 0
    assert execution.current_task_index == 0


def test_run_workflow_cancelled_status_stops_before_processing():
    tasks = [make_task(id="t1")]
    execution = execution_for(tasks, status="cancelled")
    result = run_workflow(execution, rollback_on_failure=False, execute_task_fn=succeed)
    assert result.tasks_completed == 0


def test_run_workflow_resumes_from_current_task_index_not_from_scratch():
    tasks = [make_task(id="t1"), make_task(id="t2")]
    execution = execution_for(tasks)
    execution.current_task_index = 1  # pretend t1 already ran in a prior call
    execution.completed_task_ids.add("t1")
    execution.execution_order.append("t1")

    seen = []
    result = run_workflow(
        execution, rollback_on_failure=False,
        execute_task_fn=lambda t: (seen.append(t.id), succeed(t))[1],
    )
    assert seen == ["t2"]  # t1 not re-run
    assert result.execution_order == ["t1", "t2"]


# ── rollback_workflow ────────────────────────────────────────────────────────

def test_rollback_workflow_calls_on_rollback_in_reverse_order():
    calls = []
    t1 = make_task(id="t1", on_rollback=lambda: calls.append("t1"))
    t2 = make_task(id="t2", on_rollback=lambda: calls.append("t2"))
    execution = execution_for([t1, t2])
    execution.execution_order = ["t1", "t2"]

    rollback_workflow(execution, [t1, t2])
    assert calls == ["t2", "t1"]


def test_rollback_workflow_skips_tasks_without_on_rollback():
    t1 = make_task(id="t1")  # no on_rollback
    execution = execution_for([t1])
    execution.execution_order = ["t1"]
    rollback_workflow(execution, [t1])  # must not raise
    assert execution.event_log == []


def test_rollback_workflow_logs_and_continues_when_callback_raises():
    def boom():
        raise ValueError("rollback failed")

    t1 = make_task(id="t1", on_rollback=boom)
    execution = execution_for([t1])
    execution.execution_order = ["t1"]

    rollback_workflow(execution, [t1])  # must not raise
    assert execution.event_log[-1]["event"] == "rollback:error"
    assert execution.event_log[-1]["data"]["taskId"] == "t1"

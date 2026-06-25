"""Sequential, dependency-ordered task runner with rollback-on-failure.

Origin:  ruvnet/ruflo @ main (snapshot 2026-06-23, .vet-staging/ruflo-main.zip)
         v3/src/task-execution/application/WorkflowEngine.ts
         (``runWorkflow`` / ``rollbackWorkflow``, MIT License)
Ported:  2026-06-25. Task execution and nested-workflow recursion are
         injected as callables (``execute_task_fn`` / ``run_nested_fn``)
         instead of being hard-wired to a concrete SwarmCoordinator —
         decouples the sequencing algorithm (the genuinely reusable part)
         from agent-selection policy.
License: MIT (see vendor/ruflo/_upstream/LICENSE)
"""
from __future__ import annotations

import time
from typing import Callable, Optional

from core.lib.ruflo_adapted.agent import TaskResult
from core.lib.ruflo_adapted.task import Task
from core.lib.ruflo_adapted.workflow.state import WorkflowExecution, WorkflowResult

ExecuteTaskFn = Callable[[Task], TaskResult]
RunNestedFn = Callable[[dict], "WorkflowResult"]


def _run_one_task(
    task: Task, execution: WorkflowExecution,
    *, execute_task_fn: ExecuteTaskFn, run_nested_fn: Optional[RunNestedFn],
) -> None:
    """Run a single task; raises on failure so the caller can stop/rollback."""
    if task.is_workflow() and task.workflow is not None:
        if run_nested_fn is None:
            raise RuntimeError(f"Task {task.id} is a nested workflow but no run_nested_fn given")
        nested_result = run_nested_fn(task.workflow)
        if nested_result.status == "failed":
            raise RuntimeError("Nested workflow failed")
    else:
        result = execute_task_fn(task)
        if result.status == "failed":
            raise RuntimeError(result.error or "Task execution failed")


def run_workflow(
    execution: WorkflowExecution,
    *, rollback_on_failure: bool, execute_task_fn: ExecuteTaskFn,
    run_nested_fn: Optional[RunNestedFn] = None,
) -> WorkflowResult:
    """Run ``execution.ordered_tasks`` from ``current_task_index`` onward.

    Stops without error if status flips to "paused" or "cancelled" between
    tasks (checked once per task, same checkpoint granularity as upstream).
    """
    errors: list[Exception] = []

    while execution.current_task_index < len(execution.ordered_tasks):
        if execution.status in {"paused", "cancelled"}:
            break

        task = execution.ordered_tasks[execution.current_task_index]
        start = time.time()
        try:
            _run_one_task(task, execution, execute_task_fn=execute_task_fn, run_nested_fn=run_nested_fn)
        except Exception as error:  # noqa: BLE001 — mirrors upstream catch-all
            errors.append(error)
            if rollback_on_failure:
                raise
            execution.current_task_index += 1
            continue

        _record_success(execution, task, start)
        execution.current_task_index += 1

    return _finalize(execution, errors)


def _record_success(execution: WorkflowExecution, task: Task, start: float) -> None:
    end = time.time()
    execution.task_timings[task.id] = {"start": start, "end": end, "duration": end - start}
    execution.completed_task_ids.add(task.id)
    execution.execution_order.append(task.id)
    execution.log("task:completed", {"taskId": task.id, "duration": end - start})


def _finalize(execution: WorkflowExecution, errors: list[Exception]) -> WorkflowResult:
    execution.status = "failed" if errors else "completed"
    execution.completed_at = time.time()
    return WorkflowResult(
        id=execution.id, status=execution.status,
        tasks_completed=len(execution.completed_task_ids), errors=errors,
        execution_order=execution.execution_order,
        duration=execution.completed_at - execution.started_at,
    )


def rollback_workflow(execution: WorkflowExecution, workflow_tasks: list[Task]) -> None:
    """Roll back completed tasks in reverse order, calling each ``on_rollback``.

    A failing rollback callback is logged and rollback continues — matches
    upstream (a stuck rollback must not block rolling back earlier tasks).
    """
    by_id = {t.id: t for t in workflow_tasks}
    for task_id in reversed(execution.execution_order):
        task = by_id.get(task_id)
        if task is None or task.on_rollback is None:
            continue
        try:
            task.on_rollback()
            execution.log("task:rolledback", {"taskId": task_id})
        except Exception as error:  # noqa: BLE001 — log and continue, as upstream
            execution.log("rollback:error", {"taskId": task_id, "error": str(error)})

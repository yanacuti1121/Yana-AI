"""WorkflowEngine — orchestrates execute/pause/resume/rollback of a workflow.

Origin:  ruvnet/ruflo @ main (snapshot 2026-06-23, .vet-staging/ruflo-main.zip)
         v3/src/task-execution/application/WorkflowEngine.ts (MIT License)
Ported:  2026-06-25. ``restoreWorkflow`` (load workflow state back from the
         memory backend) was not ported — it depends entirely on the fake
         in-memory "backends" vetted out in core/lib/ruflo_adapted/swarm —
         see that package's __init__.py for why. Everything else load-
         bearing is here.
License: MIT (see vendor/ruflo/_upstream/LICENSE)
"""
from __future__ import annotations

from typing import Optional

from core.lib.ruflo_adapted.agent import TaskResult
from core.lib.ruflo_adapted.task import Task, resolve_execution_order
from core.lib.ruflo_adapted.workflow.runner import ExecuteTaskFn, rollback_workflow, run_workflow
from core.lib.ruflo_adapted.workflow.state import (
    WorkflowDebugInfo,
    WorkflowDefinition,
    WorkflowExecution,
    WorkflowMetrics,
    WorkflowResult,
    create_execution,
)


class WorkflowEngine:
    """Runs ``WorkflowDefinition``s via an injected task-execution callable."""

    def __init__(self, execute_task_fn: ExecuteTaskFn):
        self._execute_task_fn = execute_task_fn
        self._executions: dict[str, WorkflowExecution] = {}

    def execute_workflow(self, workflow: WorkflowDefinition) -> WorkflowResult:
        ordered = resolve_execution_order(workflow.tasks)
        execution = create_execution(workflow, ordered)
        self._executions[workflow.id] = execution
        execution.log("workflow:started", {"workflowId": workflow.id})

        try:
            return run_workflow(
                execution, rollback_on_failure=workflow.rollback_on_failure,
                execute_task_fn=self._execute_task_fn,
                run_nested_fn=lambda wf: self.execute_workflow(WorkflowDefinition(**wf)),
            )
        except Exception as error:  # noqa: BLE001 — mirrors upstream catch-all
            if workflow.rollback_on_failure:
                rollback_workflow(execution, workflow.tasks)
            return WorkflowResult(
                id=workflow.id, status="failed",
                tasks_completed=len(execution.completed_task_ids),
                errors=[error], execution_order=execution.execution_order,
            )

    def pause_workflow(self, workflow_id: str) -> None:
        execution = self._executions.get(workflow_id)
        if execution and execution.status == "in-progress":
            execution.status = "paused"
            execution.log("workflow:paused", {"workflowId": workflow_id})

    def resume_workflow(self, workflow_id: str) -> Optional[WorkflowResult]:
        """Resume a paused workflow — re-enters the runner from where it
        stopped (see WorkflowExecution.current_task_index docstring for why
        this differs from upstream's busy-poll).
        """
        execution = self._executions.get(workflow_id)
        if execution is None or execution.status != "paused":
            return None
        execution.status = "in-progress"
        execution.log("workflow:resumed", {"workflowId": workflow_id})
        return run_workflow(
            execution, rollback_on_failure=False, execute_task_fn=self._execute_task_fn,
        )

    def cancel_workflow(self, workflow_id: str) -> None:
        execution = self._executions.get(workflow_id)
        if execution:
            execution.status = "cancelled"

    def get_workflow_state(self, workflow_id: str) -> WorkflowExecution:
        execution = self._executions.get(workflow_id)
        if execution is None:
            raise KeyError(f"Workflow {workflow_id} not found")
        return execution

    def get_workflow_metrics(self, workflow_id: str) -> WorkflowMetrics:
        execution = self.get_workflow_state(workflow_id)
        total = len(execution.ordered_tasks)
        completed = len(execution.completed_task_ids)
        durations = [t["duration"] for t in execution.task_timings.values()]
        total_duration = sum(durations)
        return WorkflowMetrics(
            tasks_total=total, tasks_completed=completed, total_duration=total_duration,
            average_task_duration=(total_duration / len(durations)) if durations else 0.0,
            success_rate=(completed / total) if total else 0.0,
        )

    def get_workflow_debug_info(self, workflow_id: str) -> WorkflowDebugInfo:
        execution = self.get_workflow_state(workflow_id)
        trace = [
            {"taskId": tid, "timestamp": execution.task_timings.get(tid, {}).get("start"), "action": "execute"}
            for tid in execution.execution_order
        ]
        return WorkflowDebugInfo(
            execution_trace=trace, task_timings=execution.task_timings, event_log=execution.event_log,
        )

    def execute_distributed(
        self, workflow: WorkflowDefinition, executors: list[ExecuteTaskFn],
    ) -> WorkflowResult:
        """Round-robin the workflow's tasks across several execute_task_fn
        callables (one per coordinator/worker), ignoring dependency order —
        matches upstream's ``executeDistributedWorkflow`` chunking, which
        is itself dependency-naive.
        """
        results: list[TaskResult] = []
        errors: list[Exception] = []
        for i, task in enumerate(workflow.tasks):
            executor = executors[i % len(executors)]
            result = executor(task)
            results.append(result)
            if result.status == "failed":
                errors.append(RuntimeError(result.error or "Task failed"))

        return WorkflowResult(
            id=workflow.id, status="completed" if not errors else "failed",
            tasks_completed=sum(1 for r in results if r.status == "completed"),
            errors=errors, execution_order=[t.id for t in workflow.tasks],
        )

"""Workflow execution state and result types.

Origin:  ruvnet/ruflo @ main (snapshot 2026-06-23, .vet-staging/ruflo-main.zip)
         v3/src/task-execution/application/WorkflowEngine.ts
         (``WorkflowExecution`` interface / ``createExecution``, MIT License)
Ported:  2026-06-25.
License: MIT (see vendor/ruflo/_upstream/LICENSE)
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from core.lib.ruflo_adapted.task import Task


@dataclass
class WorkflowDefinition:
    id: str
    name: str = ""
    tasks: list[Task] = field(default_factory=list)
    rollback_on_failure: bool = False


@dataclass
class WorkflowExecution:
    """Mutable run state for one ``execute_workflow`` call.

    ``current_task_index`` is the sync-port adaptation of upstream's
    ``while (status === 'paused') await sleep(100)`` busy-poll: there is no
    real concurrency here, so pausing stops the loop at this index instead
    of blocking, and resuming means re-invoking the runner — see
    core/lib/ruflo_adapted/workflow/__init__.py for the full rationale.
    """

    id: str
    ordered_tasks: list[Task]
    status: str = "in-progress"
    completed_task_ids: set[str] = field(default_factory=set)
    current_task_index: int = 0
    started_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    execution_order: list[str] = field(default_factory=list)
    task_timings: dict[str, dict] = field(default_factory=dict)
    event_log: list[dict] = field(default_factory=list)

    def log(self, event: str, data: dict) -> None:
        self.event_log.append({"timestamp": time.time(), "event": event, "data": data})


@dataclass
class WorkflowResult:
    id: str
    status: str  # "completed" | "failed"
    tasks_completed: int
    errors: list[Exception]
    execution_order: list[str]
    duration: Optional[float] = None


@dataclass
class WorkflowMetrics:
    tasks_total: int
    tasks_completed: int
    total_duration: float
    average_task_duration: float
    success_rate: float


@dataclass
class WorkflowDebugInfo:
    execution_trace: list[dict]
    task_timings: dict[str, dict]
    event_log: list[dict]


def create_execution(workflow: WorkflowDefinition, ordered_tasks: list[Task]) -> WorkflowExecution:
    return WorkflowExecution(id=workflow.id, ordered_tasks=ordered_tasks)

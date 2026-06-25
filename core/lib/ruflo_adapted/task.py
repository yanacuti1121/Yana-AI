"""Task entity — status lifecycle, priority, and dependency-ordered scheduling.

Origin:  ruvnet/ruflo @ main (snapshot 2026-06-23, .vet-staging/ruflo-main.zip)
         v3/src/task-execution/domain/Task.ts (MIT License)
Ported:  2026-06-25. Faithful translation from TypeScript to Python — same
         method names (snake_case), same priority/dependency semantics,
         same circular-dependency error. ``onExecute``/``onRollback`` are
         plain optional callables instead of TS async closures.
License: MIT (see vendor/ruflo/_upstream/LICENSE)

``resolve_execution_order`` is a topological sort with priority tiebreaking:
among tasks whose dependencies are all satisfied, higher-priority tasks run
first. Raises on a circular dependency instead of looping forever.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable, Optional

_PRIORITY_VALUES = {"high": 3, "medium": 2, "low": 1}


class CircularDependencyError(Exception):
    """Raised when resolve_execution_order finds an unresolvable cycle."""


@dataclass
class Task:
    """A unit of work assigned to an agent, possibly depending on others."""

    id: str
    type: str
    description: str = ""
    priority: str = "medium"
    status: str = "pending"
    assigned_to: Optional[str] = None
    dependencies: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    workflow: Optional[dict] = None
    on_execute: Optional[Callable[[], None]] = None
    on_rollback: Optional[Callable[[], None]] = None

    _started_at: Optional[float] = field(default=None, repr=False, compare=False)
    _completed_at: Optional[float] = field(default=None, repr=False, compare=False)

    def are_dependencies_resolved(self, completed_task_ids: set[str]) -> bool:
        return all(dep in completed_task_ids for dep in self.dependencies)

    def start(self) -> None:
        if self.status == "pending":
            self.status = "in-progress"
            self._started_at = time.time()

    def complete(self) -> None:
        if self.status == "in-progress":
            self.status = "completed"
            self._completed_at = time.time()

    def fail(self, error: Optional[str] = None) -> None:
        self.status = "failed"
        self._completed_at = time.time()
        if error is not None:
            self.metadata["error"] = error

    def cancel(self) -> None:
        if self.status not in {"completed", "failed"}:
            self.status = "cancelled"
            self._completed_at = time.time()

    def get_duration(self) -> Optional[float]:
        if self._started_at is not None and self._completed_at is not None:
            return self._completed_at - self._started_at
        if self._started_at is not None:
            return time.time() - self._started_at
        return None

    def is_workflow(self) -> bool:
        return self.type == "workflow" and self.workflow is not None

    def assign_to(self, agent_id: str) -> None:
        self.assigned_to = agent_id

    def get_priority_value(self) -> int:
        return _PRIORITY_VALUES.get(self.priority, 2)


def sort_by_priority(tasks: list[Task]) -> list[Task]:
    """Sort tasks high-to-low priority. Stable for equal priorities."""
    return sorted(tasks, key=lambda t: t.get_priority_value(), reverse=True)


def _next_ready_batch(remaining: list[Task], resolved_ids: set[str]) -> list[Task]:
    ready = [t for t in remaining if t.are_dependencies_resolved(resolved_ids)]
    if not ready and remaining:
        raise CircularDependencyError("Circular dependency detected in tasks")
    return sort_by_priority(ready)


def resolve_execution_order(tasks: list[Task]) -> list[Task]:
    """Topological sort by dependency, with priority tiebreaking.

    Raises CircularDependencyError if no task is ever fully unblocked.
    """
    resolved: list[Task] = []
    resolved_ids: set[str] = set()
    remaining = list(tasks)

    while remaining:
        for task in _next_ready_batch(remaining, resolved_ids):
            resolved.append(task)
            resolved_ids.add(task.id)
            remaining.remove(task)

    return resolved

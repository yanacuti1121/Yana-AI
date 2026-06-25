"""Agent entity — status lifecycle and capability-based task routing.

Origin:  ruvnet/ruflo @ main (snapshot 2026-06-23, .vet-staging/ruflo-main.zip)
         v3/src/agent-lifecycle/domain/Agent.ts (MIT License)
Ported:  2026-06-25. Faithful translation, with one deliberate omission:
         upstream's ``processTaskExecution`` sleeps for a priority-scaled
         delay before returning — the comment in that method admits the
         delay is artificial demo "processing overhead" with no real
         effect (actual work happens in ``on_execute``). Omitted as dead
         weight rather than ported as a fake timing simulation.
License: MIT (see vendor/ruflo/_upstream/LICENSE)
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from core.lib.ruflo_adapted.task import Task

_TYPE_TO_CAPABILITY = {
    "code": "code",
    "test": "test",
    "review": "review",
    "design": "design",
    "deploy": "deploy",
    "refactor": "refactor",
    "debug": "debug",
}


@dataclass
class TaskResult:
    task_id: str
    status: str  # "completed" | "failed"
    agent_id: str
    result: Optional[str] = None
    error: Optional[str] = None
    duration: Optional[float] = None


@dataclass
class Agent:
    """An AI agent that can execute tasks matching its capabilities."""

    id: str
    type: str
    capabilities: list[str] = field(default_factory=list)
    role: Optional[str] = None
    parent: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    status: str = "active"
    created_at: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)

    def has_capability(self, capability: str) -> bool:
        return capability in self.capabilities

    def can_execute(self, task_type: str) -> bool:
        required = _TYPE_TO_CAPABILITY.get(task_type)
        return self.has_capability(required) if required else True

    def execute_task(self, task: Task) -> TaskResult:
        if self.status not in {"active", "idle"}:
            return TaskResult(
                task_id=task.id, status="failed", agent_id=self.id,
                error=f"Agent {self.id} is not available (status: {self.status})",
            )

        start_time = time.time()
        self.status = "busy"
        self.last_active = start_time

        try:
            if task.on_execute is not None:
                task.on_execute()
            duration = time.time() - start_time
            self.status = "active"
            self.last_active = time.time()
            return TaskResult(
                task_id=task.id, status="completed", agent_id=self.id,
                result=f"Task {task.id} completed successfully", duration=duration,
            )
        except Exception as error:  # noqa: BLE001 — mirrors upstream catch-all
            duration = time.time() - start_time
            self.status = "active"
            return TaskResult(
                task_id=task.id, status="failed", agent_id=self.id,
                error=str(error), duration=duration,
            )

    def terminate(self) -> None:
        self.status = "terminated"
        self.last_active = time.time()

    def set_idle(self) -> None:
        if self.status in {"active", "busy"}:
            self.status = "idle"
            self.last_active = time.time()

    def activate(self) -> None:
        if self.status != "terminated":
            self.status = "active"
            self.last_active = time.time()

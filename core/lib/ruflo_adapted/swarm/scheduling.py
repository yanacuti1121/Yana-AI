"""Load-balanced task distribution and target-count agent scaling.

Origin:  ruvnet/ruflo @ main (snapshot 2026-06-23, .vet-staging/ruflo-main.zip)
         v3/src/coordination/application/SwarmCoordinator.ts
         (``distributeTasks`` / ``scaleAgents`` / ``getDefaultCapabilities``,
         MIT License)
Ported:  2026-06-25. ``scaleAgents`` carries a real upstream bugfix
         (ruflo#1872): ``count`` is the TARGET TOTAL for that agent type,
         not a delta to add — calling scale(3) then scale(2) must land at
         2, not 1+3+2=6. Preserved here as ``compute_scale_plan``.
License: MIT (see vendor/ruflo/_upstream/LICENSE)
"""
from __future__ import annotations

import time
from dataclasses import dataclass

from core.lib.ruflo_adapted.agent import Agent
from core.lib.ruflo_adapted.task import Task

_DEFAULT_CAPABILITIES = {
    "coder": ["code", "refactor", "debug"],
    "tester": ["test", "validate", "e2e"],
    "reviewer": ["review", "analyze", "security-audit"],
    "coordinator": ["coordinate", "manage", "orchestrate"],
    "designer": ["design", "prototype"],
    "deployer": ["deploy", "release"],
}


@dataclass(frozen=True)
class TaskAssignment:
    task_id: str
    agent_id: str
    assigned_at: float
    priority: str


def default_capabilities(agent_type: str) -> list[str]:
    return _DEFAULT_CAPABILITIES.get(agent_type, [])


def distribute_tasks(tasks: list[Task], agents: list[Agent]) -> list[TaskAssignment]:
    """Assign each task (priority order already resolved by the caller) to
    the active, capability-matching agent currently carrying the lowest
    load. Tasks with no suitable agent are silently skipped, same as
    upstream — the caller decides what to do with unassigned tasks.
    """
    assignments: list[TaskAssignment] = []
    loads = {agent.id: 0 for agent in agents}

    for task in tasks:
        suitable = [a for a in agents if a.status == "active" and a.can_execute(task.type)]
        if not suitable:
            continue

        best_agent = min(suitable, key=lambda a: loads.get(a.id, 0))
        assignments.append(TaskAssignment(
            task_id=task.id, agent_id=best_agent.id,
            assigned_at=time.time(), priority=task.priority,
        ))
        loads[best_agent.id] = loads.get(best_agent.id, 0) + 1

    return assignments


@dataclass(frozen=True)
class ScalePlan:
    spawn_count: int
    agents_to_remove: list[Agent]


def compute_scale_plan(existing_of_type: list[Agent], target_count: int) -> ScalePlan:
    """``target_count`` is the desired TOTAL agents of this type, not a
    delta. Scaling down removes the oldest agents first (the front of
    ``existing_of_type``, assumed insertion-ordered) for determinism.
    """
    current_count = len(existing_of_type)
    target_count = max(0, int(target_count))

    if target_count > current_count:
        return ScalePlan(spawn_count=target_count - current_count, agents_to_remove=[])
    if target_count < current_count:
        to_remove = existing_of_type[: current_count - target_count]
        return ScalePlan(spawn_count=0, agents_to_remove=to_remove)
    return ScalePlan(spawn_count=0, agents_to_remove=[])

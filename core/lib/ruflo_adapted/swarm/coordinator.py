"""SwarmCoordinator — agent registry, task execution, topology, scaling.

Origin:  ruvnet/ruflo @ main (snapshot 2026-06-23, .vet-staging/ruflo-main.zip)
         v3/src/coordination/application/SwarmCoordinator.ts (MIT License)
Ported:  2026-06-25. Faithful translation of the real (non-stub) parts —
         see core/lib/ruflo_adapted/swarm/__init__.py for what was
         deliberately left out and why.

``execute_task``'s try/except wrapping carries a real upstream bugfix
(ruflo#1872): a crashed agent must produce a structured failed TaskResult,
not an unhandled exception that takes down the caller.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from core.lib.ruflo_adapted.agent import Agent, TaskResult
from core.lib.ruflo_adapted.swarm.scheduling import (
    TaskAssignment,
    compute_scale_plan,
    default_capabilities,
    distribute_tasks,
)
from core.lib.ruflo_adapted.swarm.topology import (
    MeshConnection,
    connections_for_new_agent,
    get_leader,
    rebuild_all_connections,
)
from core.lib.ruflo_adapted.task import Task

VALID_TOPOLOGIES = frozenset({"mesh", "hierarchical"})


@dataclass
class AgentMetrics:
    agent_id: str
    tasks_completed: int = 0
    tasks_failed: int = 0
    average_execution_time: float = 0.0
    success_rate: float = 1.0
    health: str = "healthy"


@dataclass
class SwarmState:
    agents: list[Agent]
    topology: str
    leader: Optional[str]
    active_connections: int


@dataclass
class SwarmHierarchy:
    leader: str
    workers: list[dict]


class SwarmCoordinator:
    """Coordinates a swarm of agents under a mesh or hierarchical topology."""

    def __init__(self, topology: str):
        self.topology = topology
        self._agents: dict[str, Agent] = {}
        self._metrics: dict[str, AgentMetrics] = {}
        self.connections: list[MeshConnection] = []

    def spawn_agent(self, agent: Agent) -> Agent:
        others = list(self._agents.values())
        self._agents[agent.id] = agent
        self._metrics[agent.id] = AgentMetrics(agent_id=agent.id)
        self.connections.extend(connections_for_new_agent(agent, others, self.topology))
        return agent

    def list_agents(self) -> list[Agent]:
        return list(self._agents.values())

    def terminate_agent(self, agent_id: str) -> None:
        agent = self._agents.get(agent_id)
        if agent is None:
            return
        agent.terminate()
        del self._agents[agent_id]
        self._metrics.pop(agent_id, None)
        self.connections = [
            c for c in self.connections if c.from_id != agent_id and c.to_id != agent_id
        ]

    def distribute_tasks(self, tasks: list[Task]) -> list[TaskAssignment]:
        ordered = sorted(tasks, key=lambda t: t.get_priority_value(), reverse=True)
        return distribute_tasks(ordered, self.list_agents())

    def execute_task(self, agent_id: str, task: Task) -> TaskResult:
        agent = self._agents.get(agent_id)
        if agent is None:
            return TaskResult(task_id=task.id, status="failed", agent_id=agent_id,
                               error=f"Agent {agent_id} not found")

        start = time.time()
        try:
            result = agent.execute_task(task)
        except Exception as err:  # noqa: BLE001 — ruflo#1872: never let this propagate
            result = TaskResult(task_id=task.id, status="failed", agent_id=agent_id, error=str(err))
        result.duration = time.time() - start

        self._update_metrics(agent_id, result)
        return result

    def execute_tasks_concurrently(self, tasks: list[Task]) -> list[TaskResult]:
        assignments = self.distribute_tasks(tasks)
        by_id = {t.id: t for t in tasks}
        results = []
        for assignment in assignments:
            task = by_id.get(assignment.task_id)
            if task is None:
                results.append(TaskResult(task_id=assignment.task_id, status="failed",
                                           agent_id=assignment.agent_id, error="Task not found"))
                continue
            results.append(self.execute_task(assignment.agent_id, task))
        return results

    def scale_agents(self, agent_type: str, count: int, make_agent) -> None:
        """``make_agent(agent_type) -> Agent`` builds a fresh agent for
        scale-up; the caller owns ID/capability assignment policy.
        """
        existing = [a for a in self._agents.values() if a.type == agent_type]
        plan = compute_scale_plan(existing, count)
        for _ in range(plan.spawn_count):
            self.spawn_agent(make_agent(agent_type))
        for agent in plan.agents_to_remove:
            self.terminate_agent(agent.id)

    def reconfigure(self, topology: str) -> None:
        self.topology = topology
        self.connections = rebuild_all_connections(self.list_agents(), topology)

    def get_swarm_state(self) -> SwarmState:
        leader = get_leader(self.list_agents())
        return SwarmState(
            agents=self.list_agents(), topology=self.topology,
            leader=leader.id if leader else None, active_connections=len(self.connections),
        )

    def get_hierarchy(self) -> SwarmHierarchy:
        leader = get_leader(self.list_agents())
        leader_id = leader.id if leader else ""
        workers = [
            {"id": a.id, "parent": a.parent or leader_id}
            for a in self.list_agents() if a.role != "leader"
        ]
        return SwarmHierarchy(leader=leader_id, workers=workers)

    def get_mesh_connections(self) -> list[MeshConnection]:
        return self.connections

    def get_agent_metrics(self, agent_id: str) -> AgentMetrics:
        return self._metrics.get(agent_id) or AgentMetrics(
            agent_id=agent_id, average_execution_time=0.0, success_rate=0.0, health="unhealthy",
        )

    def _update_metrics(self, agent_id: str, result: TaskResult) -> None:
        metrics = self._metrics.get(agent_id)
        if metrics is None:
            return
        if result.status == "completed":
            metrics.tasks_completed += 1
        else:
            metrics.tasks_failed += 1
        # total is always >= 1 here (we just incremented one of the two
        # counters above), matching upstream's unguarded division.
        total = metrics.tasks_completed + metrics.tasks_failed
        metrics.success_rate = metrics.tasks_completed / total
        duration = result.duration or 0.0
        metrics.average_execution_time = (
            metrics.average_execution_time * (total - 1) + duration
        ) / total


def default_agent_capabilities(agent_type: str) -> list[str]:
    return default_capabilities(agent_type)

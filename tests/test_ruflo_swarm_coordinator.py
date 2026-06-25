"""Tests for the ported ruflo SwarmCoordinator.

Origin: core/lib/ruflo_adapted/swarm/coordinator.py (ported from
ruvnet/ruflo `SwarmCoordinator.ts`, MIT). No upstream `.test.ts` exists for
this file in the ruflo-main.zip snapshot — tests are written from the
documented behavior, the real ruflo#1872 bugfix it carries (a crashed
agent must yield a structured failed TaskResult, not propagate), and the
boundary cases required by fuzz-testing-constraints.md (unknown agent id,
unknown task id, agent registry empty).
"""
from __future__ import annotations

from core.lib.ruflo_adapted.agent import Agent, TaskResult
from core.lib.ruflo_adapted.swarm.coordinator import SwarmCoordinator
from core.lib.ruflo_adapted.task import Task


def make_agent(**overrides) -> Agent:
    defaults = dict(id="a1", type="coder", capabilities=["code"])
    defaults.update(overrides)
    return Agent(**defaults)


def make_task(**overrides) -> Task:
    defaults = dict(id="t1", type="code")
    defaults.update(overrides)
    return Task(**defaults)


# ── spawn / list / terminate ────────────────────────────────────────────────

def test_spawn_agent_registers_and_returns_agent():
    coordinator = SwarmCoordinator("mesh")
    agent = coordinator.spawn_agent(make_agent())
    assert coordinator.list_agents() == [agent]


def test_spawn_agent_in_mesh_creates_peer_connections():
    coordinator = SwarmCoordinator("mesh")
    coordinator.spawn_agent(make_agent(id="a1"))
    coordinator.spawn_agent(make_agent(id="a2"))
    assert len(coordinator.get_mesh_connections()) == 1


def test_terminate_agent_removes_from_registry_and_connections():
    coordinator = SwarmCoordinator("mesh")
    coordinator.spawn_agent(make_agent(id="a1"))
    a2 = coordinator.spawn_agent(make_agent(id="a2"))
    coordinator.terminate_agent("a1")

    assert [a.id for a in coordinator.list_agents()] == ["a2"]
    assert coordinator.get_mesh_connections() == []
    assert a2.status == "active"  # only a1 was terminated


def test_terminate_agent_unknown_id_is_noop():
    coordinator = SwarmCoordinator("mesh")
    coordinator.terminate_agent("ghost")  # must not raise
    assert coordinator.list_agents() == []


# ── execute_task ─────────────────────────────────────────────────────────────

def test_execute_task_unknown_agent_returns_failed_with_no_duration():
    coordinator = SwarmCoordinator("mesh")
    result = coordinator.execute_task("ghost", make_task())
    assert result.status == "failed"
    assert "not found" in result.error
    assert result.duration is None


def test_execute_task_success_updates_metrics():
    coordinator = SwarmCoordinator("mesh")
    coordinator.spawn_agent(make_agent())
    result = coordinator.execute_task("a1", make_task())

    assert result.status == "completed"
    metrics = coordinator.get_agent_metrics("a1")
    assert metrics.tasks_completed == 1
    assert metrics.tasks_failed == 0
    assert metrics.success_rate == 1.0


def test_execute_task_crash_in_agent_yields_structured_failure_ruflo_1872():
    # ruflo#1872: a crashed agent.execute_task() must not propagate — the
    # coordinator wraps it into a normal failed TaskResult.
    class CrashingAgent(Agent):
        def execute_task(self, task):  # noqa: D102 — test double
            raise RuntimeError("agent process died")

    coordinator = SwarmCoordinator("mesh")
    coordinator.spawn_agent(CrashingAgent(id="a1", type="coder", capabilities=["code"]))
    result = coordinator.execute_task("a1", make_task())

    assert result.status == "failed"
    assert result.error == "agent process died"
    metrics = coordinator.get_agent_metrics("a1")
    assert metrics.tasks_failed == 1


def test_execute_task_metrics_average_execution_time_accumulates():
    coordinator = SwarmCoordinator("mesh")
    coordinator.spawn_agent(make_agent())
    coordinator.execute_task("a1", make_task(id="t1"))
    coordinator.execute_task("a1", make_task(id="t2"))

    metrics = coordinator.get_agent_metrics("a1")
    assert metrics.tasks_completed == 2
    assert metrics.average_execution_time >= 0


# ── distribute / execute concurrently ────────────────────────────────────────

def test_distribute_tasks_sorts_by_priority_before_assigning():
    coordinator = SwarmCoordinator("mesh")
    coordinator.spawn_agent(make_agent(id="a1"))
    low = make_task(id="low", priority="low")
    high = make_task(id="high", priority="high")
    assignments = coordinator.distribute_tasks([low, high])
    assert [a.task_id for a in assignments] == ["high", "low"]


def test_execute_tasks_concurrently_runs_all_assigned_tasks():
    coordinator = SwarmCoordinator("mesh")
    coordinator.spawn_agent(make_agent(id="a1"))
    tasks = [make_task(id="t1"), make_task(id="t2")]
    results = coordinator.execute_tasks_concurrently(tasks)
    assert {r.task_id for r in results} == {"t1", "t2"}
    assert all(r.status == "completed" for r in results)


def test_execute_tasks_concurrently_skips_when_no_suitable_agent():
    coordinator = SwarmCoordinator("mesh")
    results = coordinator.execute_tasks_concurrently([make_task()])
    assert results == []  # no agents -> no assignments -> no results


# ── scale_agents ─────────────────────────────────────────────────────────────

def test_scale_agents_spawns_up_to_target():
    coordinator = SwarmCoordinator("mesh")
    made = []

    def make(agent_type: str) -> Agent:
        agent = make_agent(id=f"{agent_type}-{len(made)}", type=agent_type)
        made.append(agent)
        return agent

    coordinator.scale_agents("coder", 3, make)
    assert len(coordinator.list_agents()) == 3


def test_scale_agents_target_is_total_not_delta_ruflo_1872():
    coordinator = SwarmCoordinator("mesh")
    counter = {"n": 0}

    def make(agent_type: str) -> Agent:
        counter["n"] += 1
        return make_agent(id=f"coder-{counter['n']}", type=agent_type)

    coordinator.scale_agents("coder", 3, make)
    coordinator.scale_agents("coder", 2, make)
    assert len([a for a in coordinator.list_agents() if a.type == "coder"]) == 2


def test_scale_agents_down_terminates_excess():
    coordinator = SwarmCoordinator("mesh")
    coordinator.spawn_agent(make_agent(id="a1"))
    coordinator.spawn_agent(make_agent(id="a2"))
    coordinator.scale_agents("coder", 1, lambda t: make_agent(id="unused"))
    assert [a.id for a in coordinator.list_agents()] == ["a2"]


# ── reconfigure / state / hierarchy ──────────────────────────────────────────

def test_reconfigure_changes_topology_and_rebuilds_connections():
    coordinator = SwarmCoordinator("mesh")
    coordinator.spawn_agent(make_agent(id="leader", role="leader"))
    coordinator.spawn_agent(make_agent(id="worker"))
    coordinator.reconfigure("hierarchical")

    assert coordinator.topology == "hierarchical"
    assert len(coordinator.get_mesh_connections()) == 1  # worker -> leader only


def test_get_swarm_state_reports_leader_and_connection_count():
    coordinator = SwarmCoordinator("hierarchical")
    coordinator.spawn_agent(make_agent(id="leader", role="leader"))
    coordinator.spawn_agent(make_agent(id="worker"))

    state = coordinator.get_swarm_state()
    assert state.leader == "leader"
    assert state.topology == "hierarchical"
    assert state.active_connections == 1


def test_get_swarm_state_no_leader_is_none():
    coordinator = SwarmCoordinator("mesh")
    coordinator.spawn_agent(make_agent(id="solo"))
    assert coordinator.get_swarm_state().leader is None


def test_get_hierarchy_lists_workers_under_leader():
    coordinator = SwarmCoordinator("hierarchical")
    coordinator.spawn_agent(make_agent(id="leader", role="leader"))
    coordinator.spawn_agent(make_agent(id="worker"))

    hierarchy = coordinator.get_hierarchy()
    assert hierarchy.leader == "leader"
    assert hierarchy.workers == [{"id": "worker", "parent": "leader"}]


def test_get_agent_metrics_unknown_agent_returns_unhealthy_default():
    coordinator = SwarmCoordinator("mesh")
    metrics = coordinator.get_agent_metrics("ghost")
    assert metrics.health == "unhealthy"
    assert metrics.success_rate == 0.0

"""Tests for ported ruflo load-balanced scheduling and scale planning.

Origin: core/lib/ruflo_adapted/swarm/scheduling.py (ported from ruvnet/ruflo
`SwarmCoordinator.ts`'s `distributeTasks`/`scaleAgents`/
`getDefaultCapabilities`, MIT). No upstream `.test.ts` exists for this file
in the ruflo-main.zip snapshot — tests are written from the documented
behavior, plus the ruflo#1872 scale-target regression noted in the module
docstring and the boundary cases required by fuzz-testing-constraints.md
(empty agent/task lists, negative/float scale targets).
"""
from __future__ import annotations

from core.lib.ruflo_adapted.agent import Agent
from core.lib.ruflo_adapted.swarm.scheduling import (
    compute_scale_plan,
    default_capabilities,
    distribute_tasks,
)
from core.lib.ruflo_adapted.task import Task


def make_agent(**overrides) -> Agent:
    defaults = dict(id="a1", type="coder", capabilities=["code"], status="active")
    defaults.update(overrides)
    return Agent(**defaults)


def make_task(**overrides) -> Task:
    defaults = dict(id="t1", type="code")
    defaults.update(overrides)
    return Task(**defaults)


# ── default_capabilities ───────────────────────────────────────────────────

def test_default_capabilities_known_type():
    assert default_capabilities("coder") == ["code", "refactor", "debug"]


def test_default_capabilities_unknown_type_is_empty():
    assert default_capabilities("astronaut") == []


# ── distribute_tasks ────────────────────────────────────────────────────────

def test_distribute_tasks_empty_agents_yields_no_assignments():
    assert distribute_tasks([make_task()], []) == []


def test_distribute_tasks_empty_tasks_yields_no_assignments():
    assert distribute_tasks([], [make_agent()]) == []


def test_distribute_tasks_skips_inactive_agents():
    agent = make_agent(status="idle")
    assert distribute_tasks([make_task()], [agent]) == []


def test_distribute_tasks_skips_agent_without_capability():
    agent = make_agent(capabilities=["test"])
    assignments = distribute_tasks([make_task(type="code")], [agent])
    assert assignments == []


def test_distribute_tasks_unassignable_task_is_skipped_not_fatal():
    suitable = make_agent(id="a1", capabilities=["code"])
    unassignable = make_task(id="t1", type="deploy")
    assignable = make_task(id="t2", type="code")
    assignments = distribute_tasks([unassignable, assignable], [suitable])
    assert [a.task_id for a in assignments] == ["t2"]
    assert assignments[0].agent_id == "a1"


def test_distribute_tasks_load_balances_across_suitable_agents():
    a1 = make_agent(id="a1", capabilities=["code"])
    a2 = make_agent(id="a2", capabilities=["code"])
    tasks = [make_task(id="t1"), make_task(id="t2"), make_task(id="t3")]
    assignments = distribute_tasks(tasks, [a1, a2])

    assert len(assignments) == 3
    counts: dict[str, int] = {}
    for assignment in assignments:
        counts[assignment.agent_id] = counts.get(assignment.agent_id, 0) + 1
    # 3 tasks over 2 equally-loaded agents must split 2/1, never 3/0
    assert sorted(counts.values()) == [1, 2]


def test_distribute_tasks_carries_priority_onto_assignment():
    agent = make_agent()
    assignment = distribute_tasks([make_task(priority="high")], [agent])[0]
    assert assignment.priority == "high"


# ── compute_scale_plan ──────────────────────────────────────────────────────

def test_compute_scale_plan_scale_up_from_empty():
    plan = compute_scale_plan([], 3)
    assert plan.spawn_count == 3
    assert plan.agents_to_remove == []


def test_compute_scale_plan_scale_down_removes_oldest_first():
    a1, a2, a3 = make_agent(id="a1"), make_agent(id="a2"), make_agent(id="a3")
    plan = compute_scale_plan([a1, a2, a3], 1)
    assert plan.spawn_count == 0
    assert [a.id for a in plan.agents_to_remove] == ["a1", "a2"]


def test_compute_scale_plan_no_change_when_target_equals_current():
    a1 = make_agent(id="a1")
    plan = compute_scale_plan([a1], 1)
    assert plan.spawn_count == 0
    assert plan.agents_to_remove == []


def test_compute_scale_plan_repeated_calls_target_total_not_delta():
    # ruflo#1872 regression: scale(3) then scale(2) must land at 2 agents
    # total, not 1+3+2.
    existing: list[Agent] = []
    plan1 = compute_scale_plan(existing, 3)
    assert plan1.spawn_count == 3
    existing = [make_agent(id=f"a{i}") for i in range(3)]
    plan2 = compute_scale_plan(existing, 2)
    assert plan2.spawn_count == 0
    assert len(plan2.agents_to_remove) == 1


def test_compute_scale_plan_negative_target_clamps_to_zero():
    a1 = make_agent(id="a1")
    plan = compute_scale_plan([a1], -5)
    assert plan.spawn_count == 0
    assert [a.id for a in plan.agents_to_remove] == ["a1"]


def test_compute_scale_plan_float_target_truncates():
    plan = compute_scale_plan([], 2.9)
    assert plan.spawn_count == 2

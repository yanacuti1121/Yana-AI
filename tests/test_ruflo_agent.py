"""Tests for the ported ruflo Agent entity.

Origin: core/lib/ruflo_adapted/agent.py (ported from ruvnet/ruflo, MIT).
No upstream `.test.ts` exists for `v3/src/agent-lifecycle/domain/Agent.ts`
(checked: only `Agent.ts` itself was vendored, no test counterpart in the
ruflo-main.zip snapshot) — these tests are written from the documented
behavior in agent.py's docstrings/code, plus the boundary cases required
by fuzz-testing-constraints.md (empty capability list, unknown task type,
exception during execution).
"""
from __future__ import annotations

import pytest

from core.lib.ruflo_adapted.agent import Agent, TaskResult
from core.lib.ruflo_adapted.task import Task


def make_agent(**overrides) -> Agent:
    defaults = dict(id="agent-1", type="coder", capabilities=["code", "debug"])
    defaults.update(overrides)
    return Agent(**defaults)


def make_task(**overrides) -> Task:
    defaults = dict(id="task-1", type="code")
    defaults.update(overrides)
    return Task(**defaults)


# ── has_capability / can_execute ──────────────────────────────────────────

def test_has_capability_true_and_false():
    agent = make_agent(capabilities=["code"])
    assert agent.has_capability("code") is True
    assert agent.has_capability("deploy") is False


def test_has_capability_empty_list():
    agent = make_agent(capabilities=[])
    assert agent.has_capability("code") is False


def test_can_execute_known_type_with_capability():
    agent = make_agent(capabilities=["test"])
    assert agent.can_execute("test") is True


def test_can_execute_known_type_without_capability():
    agent = make_agent(capabilities=["code"])
    assert agent.can_execute("test") is False


def test_can_execute_unknown_type_defaults_true():
    agent = make_agent(capabilities=[])
    assert agent.can_execute("some-unrecognized-type") is True


# ── execute_task ───────────────────────────────────────────────────────────

def test_execute_task_success_resets_status_and_sets_duration():
    agent = make_agent(status="active")
    task = make_task()
    result = agent.execute_task(task)

    assert isinstance(result, TaskResult)
    assert result.status == "completed"
    assert result.task_id == "task-1"
    assert result.agent_id == "agent-1"
    assert result.duration is not None and result.duration >= 0
    assert agent.status == "active"


def test_execute_task_calls_on_execute_callback():
    calls = []
    task = make_task(on_execute=lambda: calls.append("ran"))
    agent = make_agent()
    agent.execute_task(task)
    assert calls == ["ran"]


def test_execute_task_idle_agent_is_allowed():
    agent = make_agent(status="idle")
    result = agent.execute_task(make_task())
    assert result.status == "completed"


@pytest.mark.parametrize("status", ["busy", "terminated", "offline"])
def test_execute_task_unavailable_agent_fails_without_running_callback(status):
    calls = []
    agent = make_agent(status=status)
    task = make_task(on_execute=lambda: calls.append("ran"))
    result = agent.execute_task(task)

    assert result.status == "failed"
    assert "not available" in result.error
    assert status in result.error
    assert calls == []
    assert agent.status == status  # unchanged — never touched busy/active path


def test_execute_task_callback_exception_yields_failed_result_and_recovers_status():
    def boom():
        raise ValueError("kaboom")

    agent = make_agent(status="active")
    task = make_task(on_execute=boom)
    result = agent.execute_task(task)

    assert result.status == "failed"
    assert result.error == "kaboom"
    assert result.duration is not None and result.duration >= 0
    assert agent.status == "active"  # recovers, not stuck at "busy"


# ── lifecycle transitions ───────────────────────────────────────────────────

def test_terminate_sets_status():
    agent = make_agent(status="active")
    agent.terminate()
    assert agent.status == "terminated"


@pytest.mark.parametrize("start_status", ["active", "busy"])
def test_set_idle_from_active_or_busy(start_status):
    agent = make_agent(status=start_status)
    agent.set_idle()
    assert agent.status == "idle"


def test_set_idle_is_noop_when_already_idle():
    agent = make_agent(status="idle")
    last_active_before = agent.last_active
    agent.set_idle()
    assert agent.status == "idle"
    assert agent.last_active == last_active_before


def test_set_idle_is_noop_when_terminated():
    agent = make_agent(status="terminated")
    agent.set_idle()
    assert agent.status == "terminated"


def test_activate_from_idle_or_busy():
    agent = make_agent(status="idle")
    agent.activate()
    assert agent.status == "active"


def test_activate_is_noop_when_terminated():
    agent = make_agent(status="terminated")
    agent.activate()
    assert agent.status == "terminated"

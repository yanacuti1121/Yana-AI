"""Tests for the small Hermes retry-support modules ported alongside
error_classifier: retry_utils, turn_retry_state, iteration_budget.

Origin: core/lib/hermes_adapted/{retry_utils,turn_retry_state,iteration_budget}.py
        (ported from NousResearch/hermes-agent, MIT)
"""
from __future__ import annotations

import threading

import pytest

from core.lib.hermes_adapted.iteration_budget import IterationBudget
from core.lib.hermes_adapted.retry_utils import jittered_backoff
from core.lib.hermes_adapted.turn_retry_state import TurnRetryState


# ── jittered_backoff ──────────────────────────────────────────────────────

def test_jittered_backoff_increases_with_attempt():
    # Compare the deterministic floor (no jitter) rather than raw samples,
    # since jitter alone could make a later attempt's sample smaller.
    assert (5.0 * 2 ** 0) < (5.0 * 2 ** 3)
    delay1 = jittered_backoff(1, base_delay=5.0, max_delay=120.0, jitter_ratio=0.0)
    delay4 = jittered_backoff(4, base_delay=5.0, max_delay=120.0, jitter_ratio=0.0)
    assert delay1 == pytest.approx(5.0)
    assert delay4 == pytest.approx(40.0)


def test_jittered_backoff_caps_at_max_delay():
    delay = jittered_backoff(50, base_delay=5.0, max_delay=120.0, jitter_ratio=0.0)
    assert delay == pytest.approx(120.0)


def test_jittered_backoff_jitter_is_nonnegative_and_bounded():
    delay = jittered_backoff(1, base_delay=10.0, max_delay=120.0, jitter_ratio=0.5)
    assert 10.0 <= delay <= 10.0 + 0.5 * 10.0


def test_jittered_backoff_huge_attempt_does_not_crash():
    # Boundary case: exponent >= 63 must fall back to max_delay, not overflow.
    delay = jittered_backoff(1000, base_delay=5.0, max_delay=120.0)
    assert delay >= 120.0


def test_jittered_backoff_zero_base_delay():
    delay = jittered_backoff(3, base_delay=0.0, max_delay=120.0, jitter_ratio=0.0)
    assert delay == pytest.approx(120.0)


# ── TurnRetryState ─────────────────────────────────────────────────────────

def test_turn_retry_state_defaults_all_false():
    state = TurnRetryState()
    assert all(value is False for _, value in state)


def test_turn_retry_state_mutation_is_independent_per_instance():
    a = TurnRetryState()
    b = TurnRetryState()
    a.codex_auth_retry_attempted = True
    assert b.codex_auth_retry_attempted is False


def test_turn_retry_state_iter_yields_all_fields():
    state = TurnRetryState()
    names = {name for name, _ in state}
    assert "restart_with_compressed_messages" in names
    assert "has_retried_429" in names


# ── IterationBudget ────────────────────────────────────────────────────────

def test_iteration_budget_consume_until_exhausted():
    budget = IterationBudget(max_total=2)
    assert budget.consume() is True
    assert budget.consume() is True
    assert budget.consume() is False
    assert budget.used == 2
    assert budget.remaining == 0


def test_iteration_budget_refund_gives_back_one():
    budget = IterationBudget(max_total=1)
    assert budget.consume() is True
    budget.refund()
    assert budget.remaining == 1
    assert budget.consume() is True


def test_iteration_budget_refund_below_zero_is_clamped():
    budget = IterationBudget(max_total=5)
    budget.refund()  # never consumed — must not go negative
    assert budget.used == 0


def test_iteration_budget_zero_max_total_blocks_immediately():
    budget = IterationBudget(max_total=0)
    assert budget.consume() is False
    assert budget.remaining == 0


def test_iteration_budget_thread_safe_consume():
    budget = IterationBudget(max_total=100)
    successes = []

    def worker():
        for _ in range(10):
            if budget.consume():
                successes.append(1)

    threads = [threading.Thread(target=worker) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sum(successes) == 100
    assert budget.used == 100

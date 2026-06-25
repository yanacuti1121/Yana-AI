"""Tests for ported ruflo mesh/hierarchical connection topology.

Origin: core/lib/ruflo_adapted/swarm/topology.py (ported from ruvnet/ruflo
`SwarmCoordinator.ts`'s `updateConnections`/`getLeader`, MIT). No upstream
`.test.ts` exists for this file in the ruflo-main.zip snapshot — tests are
written from the documented behavior, plus the boundary cases required by
fuzz-testing-constraints.md (empty agent lists, unknown topology string).
"""
from __future__ import annotations

from core.lib.ruflo_adapted.agent import Agent
from core.lib.ruflo_adapted.swarm.topology import (
    connections_for_new_agent,
    get_leader,
    rebuild_all_connections,
)


def make_agent(**overrides) -> Agent:
    defaults = dict(id="a1", type="coder")
    defaults.update(overrides)
    return Agent(**defaults)


# ── get_leader ──────────────────────────────────────────────────────────────

def test_get_leader_finds_leader_role():
    leader = make_agent(id="leader", role="leader")
    worker = make_agent(id="worker")
    assert get_leader([worker, leader]) is leader


def test_get_leader_returns_none_when_absent():
    assert get_leader([make_agent()]) is None


def test_get_leader_empty_list():
    assert get_leader([]) is None


# ── connections_for_new_agent: mesh ──────────────────────────────────────────

def test_mesh_connects_to_all_existing_agents():
    new = make_agent(id="new")
    existing = [make_agent(id="a1"), make_agent(id="a2")]
    conns = connections_for_new_agent(new, existing, "mesh")

    assert {(c.from_id, c.to_id, c.type) for c in conns} == {
        ("new", "a1", "peer"),
        ("new", "a2", "peer"),
    }


def test_mesh_with_no_existing_agents_yields_no_connections():
    assert connections_for_new_agent(make_agent(id="new"), [], "mesh") == []


def test_mesh_excludes_self_if_present_in_existing():
    new = make_agent(id="new")
    conns = connections_for_new_agent(new, [new], "mesh")
    assert conns == []


# ── connections_for_new_agent: hierarchical ─────────────────────────────────

def test_hierarchical_worker_connects_to_leader():
    leader = make_agent(id="leader", role="leader")
    worker = make_agent(id="worker")
    conns = connections_for_new_agent(worker, [leader], "hierarchical")
    assert len(conns) == 1
    assert conns[0].from_id == "worker"
    assert conns[0].to_id == "leader"
    assert conns[0].type == "leader"


def test_hierarchical_with_no_leader_yields_no_connections():
    worker = make_agent(id="worker")
    other = make_agent(id="other")
    assert connections_for_new_agent(worker, [other], "hierarchical") == []


def test_hierarchical_new_leader_has_no_parent_connection():
    existing_leader = make_agent(id="old-leader", role="leader")
    new_leader = make_agent(id="new-leader", role="leader")
    assert connections_for_new_agent(new_leader, [existing_leader], "hierarchical") == []


# ── unknown topology ─────────────────────────────────────────────────────────

def test_unknown_topology_yields_no_connections():
    new = make_agent(id="new")
    existing = [make_agent(id="a1")]
    assert connections_for_new_agent(new, existing, "star") == []


# ── rebuild_all_connections ──────────────────────────────────────────────────

def test_rebuild_mesh_connects_every_directed_pair():
    agents = [make_agent(id="a"), make_agent(id="b"), make_agent(id="c")]
    conns = rebuild_all_connections(agents, "mesh")
    # n * (n - 1) directed peer connections for full mesh
    assert len(conns) == 6
    assert all(c.type == "peer" for c in conns)


def test_rebuild_hierarchical_connects_workers_to_leader_only():
    leader = make_agent(id="leader", role="leader")
    workers = [make_agent(id="w1"), make_agent(id="w2")]
    conns = rebuild_all_connections([leader, *workers], "hierarchical")
    assert {(c.from_id, c.to_id) for c in conns} == {("w1", "leader"), ("w2", "leader")}


def test_rebuild_all_connections_empty_agents():
    assert rebuild_all_connections([], "mesh") == []

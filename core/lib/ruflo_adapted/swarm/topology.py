"""Mesh / hierarchical connection topology for a swarm of agents.

Origin:  ruvnet/ruflo @ main (snapshot 2026-06-23, .vet-staging/ruflo-main.zip)
         v3/src/coordination/application/SwarmCoordinator.ts
         (``updateConnections`` / ``getLeader``, MIT License)
Ported:  2026-06-25. Pulled out of the coordinator as pure functions —
         upstream mutates ``this.connections`` in place; here the caller
         owns the list and appends what these return.
License: MIT (see vendor/ruflo/_upstream/LICENSE)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from core.lib.ruflo_adapted.agent import Agent


@dataclass(frozen=True)
class MeshConnection:
    from_id: str
    to_id: str
    type: str  # "peer" | "leader"


def get_leader(agents: list[Agent]) -> Optional[Agent]:
    return next((a for a in agents if a.role == "leader"), None)


def connections_for_new_agent(
    new_agent: Agent, existing_agents: list[Agent], topology: str,
) -> list[MeshConnection]:
    """Connections to add when ``new_agent`` joins a swarm using ``topology``.

    mesh: connect the new agent to every other current agent (all-to-all).
    hierarchical: connect the new agent to the current leader, unless the
    new agent *is* the leader (a leader has no parent to connect to).
    """
    if topology == "mesh":
        return [
            MeshConnection(new_agent.id, other.id, "peer")
            for other in existing_agents
            if other.id != new_agent.id
        ]
    if topology == "hierarchical":
        leader = get_leader(existing_agents)
        if leader is not None and new_agent.role != "leader":
            return [MeshConnection(new_agent.id, leader.id, "leader")]
    return []


def rebuild_all_connections(agents: list[Agent], topology: str) -> list[MeshConnection]:
    """Recompute the full connection set from scratch (e.g. after a
    topology change). Matches upstream exactly: each agent is connected
    against *every* other current agent, not just previously-processed
    ones — for mesh topology this yields both directions of every pair
    (A->B and B->A), same as calling ``connections_for_new_agent`` once
    per agent against the full roster.
    """
    connections: list[MeshConnection] = []
    for agent in agents:
        others = [a for a in agents if a.id != agent.id]
        connections.extend(connections_for_new_agent(agent, others, topology))
    return connections

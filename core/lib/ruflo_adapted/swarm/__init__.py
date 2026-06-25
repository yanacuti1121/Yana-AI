"""SwarmCoordinator port — agent registry, topology, load-balanced scheduling.

Origin:  ruvnet/ruflo @ main (snapshot 2026-06-23, .vet-staging/ruflo-main.zip)
         v3/src/coordination/application/SwarmCoordinator.ts (MIT License)

Deliberately NOT ported from the upstream class (verified non-functional or
out of scope, not a faithful-port oversight):
  - ``reachConsensus`` — votes with ``Math.random() > 0.5``, no real model
    call. Yana AI already has a real BFT consensus design
    (core/rules/54-bft-consensus-law.md) — porting a coin-flip "consensus"
    would be actively misleading.
  - Memory-backend persistence calls (``memoryBackend.store(...)`` on every
    spawn/task-result) — the three backends behind that interface
    (AgentDBBackend/SQLiteBackend/HybridBackend) are themselves in-memory
    Map stubs, not real SQLite/vector storage (see their docstrings/commit
    history). Persisting through a fake backend has no value; Yana AI's own
    L1/L2 memory system is the real persistence layer.
  - ``pluginManager`` extension-point hooks — no plugin system exists to
    call into on this side; would be dead parameters.
"""
from __future__ import annotations

from core.lib.ruflo_adapted.swarm.coordinator import (
    AgentMetrics,
    SwarmCoordinator,
    SwarmHierarchy,
    SwarmState,
)
from core.lib.ruflo_adapted.swarm.scheduling import ScalePlan, TaskAssignment
from core.lib.ruflo_adapted.swarm.topology import MeshConnection

__all__ = [
    "SwarmCoordinator", "AgentMetrics", "SwarmState", "SwarmHierarchy",
    "TaskAssignment", "ScalePlan", "MeshConnection",
]

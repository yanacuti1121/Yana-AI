"""Faithful Python ports of vetted ruvnet/ruflo (MIT) task/swarm logic.

Origin: ruvnet/ruflo @ main (snapshot 2026-06-23, .vet-staging/ruflo-main.zip)
        v3/src/{task-execution,agent-lifecycle,coordination}/
License: MIT (see vendor/ruflo/_upstream/LICENSE)

See core/lib/ruflo_adapted/swarm/__init__.py for what was vetted but
deliberately NOT ported (the in-memory-stub "AgentDB"/"SQLite" backends and
the coin-flip "consensus" — neither does what its name claims upstream).
"""
from __future__ import annotations

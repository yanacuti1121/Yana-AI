"""Exec approval request/decision state machine — port, adapted.

Origin:  openclaw/openclaw @ 4799fe7df6c46f3911ecc4db9117bfc329eb4f34
         src/gateway/exec-approval-manager.ts (MIT License)
Ported:  2026-06-19. Adapted: Node `setTimeout`/`Promise` are replaced with
         `threading.Timer` + `threading.Event` (matching the
         core/lib/hermes_adapted/memory_manager.py threading convention in
         this repo). `awaitDecision`/`register` returning a JS Promise is
         replaced by `wait_for_decision(record_id, timeout_s)`, a blocking
         call a caller thread can invoke directly. The `unrefTimer` Node
         event-loop-keepalive workaround has no Python equivalent and is
         dropped (Python threads already don't block interpreter exit when
         marked daemon).
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: tracks pending human-approval-gate decisions for a command the
exec-approval gate flagged as needing operator sign-off (the workflow layer
above match_allowlist's pure decision) — registration, timeout-driven
expiry, one-time "allow-once" consumption, and prefix-based id lookup for an
operator typing a short id instead of the full UUID.
"""
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Generic, TypeVar

_RESOLVED_ENTRY_GRACE_S = 15.0

TPayload = TypeVar("TPayload")


@dataclass
class ExecApprovalRecord(Generic[TPayload]):
    id: str
    request: TPayload
    created_at_s: float
    expires_at_s: float
    requested_by_conn_id: str | None = None
    requested_by_device_id: str | None = None
    requested_by_client_id: str | None = None
    requested_by_device_token_auth: bool = False
    resolved_at_s: float | None = None
    decision: str | None = None
    consumed_decision: str | None = None
    resolved_by: str | None = None


@dataclass
class _PendingEntry(Generic[TPayload]):
    record: ExecApprovalRecord[TPayload]
    event: threading.Event = field(default_factory=threading.Event)
    timer: threading.Timer | None = None


def _resolve_approval_timeout_s(timeout_s: float) -> float:
    return max(timeout_s, 0.001)


class ExecApprovalManager(Generic[TPayload]):
    """Tracks pending operator decisions and short-lived resolved records."""

    def __init__(self) -> None:
        self._pending: dict[str, _PendingEntry[TPayload]] = {}
        self._lock = threading.Lock()

    def create(self, request: TPayload, timeout_s: float, id_: str | None = None) -> ExecApprovalRecord[TPayload]:
        now = time.monotonic()
        resolved_timeout_s = _resolve_approval_timeout_s(timeout_s)
        resolved_id = id_.strip() if id_ and id_.strip() else str(uuid.uuid4())
        return ExecApprovalRecord(
            id=resolved_id, request=request, created_at_s=now, expires_at_s=now + resolved_timeout_s
        )

    def register(self, record: ExecApprovalRecord[TPayload], timeout_s: float) -> threading.Event:
        """Register a record and return an Event set when a decision lands.

        Idempotent: re-registering a still-pending id returns its existing
        Event rather than creating a second timer.
        """
        with self._lock:
            existing = self._pending.get(record.id)
            if existing:
                if existing.record.resolved_at_s is None:
                    return existing.event
                raise ValueError(f"approval id '{record.id}' already resolved")

            entry: _PendingEntry[TPayload] = _PendingEntry(record=record)
            timer_delay_s = _resolve_approval_timeout_s(timeout_s)
            entry.timer = threading.Timer(timer_delay_s, self.expire, args=(record.id,))
            entry.timer.daemon = True
            self._pending[record.id] = entry
            entry.timer.start()
            return entry.event

    def resolve(self, record_id: str, decision: str, resolved_by: str | None = None) -> bool:
        with self._lock:
            pending = self._pending.get(record_id)
            if not pending or pending.record.resolved_at_s is not None:
                return False
            if pending.timer:
                pending.timer.cancel()
            pending.record.resolved_at_s = time.monotonic()
            pending.record.decision = decision
            pending.record.resolved_by = resolved_by
        pending.event.set()
        self._schedule_resolved_entry_cleanup(record_id, pending)
        return True

    def expire(self, record_id: str, resolved_by: str | None = None) -> bool:
        with self._lock:
            pending = self._pending.get(record_id)
            if not pending or pending.record.resolved_at_s is not None:
                return False
            pending.record.resolved_at_s = time.monotonic()
            pending.record.decision = None
            pending.record.resolved_by = resolved_by
        pending.event.set()
        self._schedule_resolved_entry_cleanup(record_id, pending)
        return True

    def _schedule_resolved_entry_cleanup(self, record_id: str, pending: _PendingEntry[TPayload]) -> None:
        def cleanup() -> None:
            with self._lock:
                if self._pending.get(record_id) is pending:
                    del self._pending[record_id]

        cleanup_timer = threading.Timer(_RESOLVED_ENTRY_GRACE_S, cleanup)
        cleanup_timer.daemon = True
        cleanup_timer.start()

    def get_snapshot(self, record_id: str) -> ExecApprovalRecord[TPayload] | None:
        entry = self._pending.get(record_id)
        return entry.record if entry else None

    def list_pending_records(self) -> list[ExecApprovalRecord[TPayload]]:
        return [e.record for e in self._pending.values() if e.record.resolved_at_s is None]

    def consume_allow_once(self, record_id: str) -> bool:
        entry = self._pending.get(record_id)
        if not entry:
            return False
        record = entry.record
        if record.decision != "allow-once":
            return False
        record.consumed_decision = record.decision
        record.decision = None
        return True

    def wait_for_decision(self, record_id: str, timeout_s: float | None = None) -> str | None:
        """Block until the record resolves (or times out waiting), then return its decision."""
        entry = self._pending.get(record_id)
        if not entry:
            return None
        entry.event.wait(timeout=timeout_s)
        return entry.record.decision

    def lookup_approval_id(
        self, input_: str, *, include_resolved: bool = False, filter_: Callable[[ExecApprovalRecord], bool] | None = None
    ) -> dict[str, Any]:
        normalized = input_.strip()
        if not normalized:
            return {"kind": "none"}

        exact = self._pending.get(normalized)
        if exact:
            visible = include_resolved or exact.record.resolved_at_s is None
            matches_filter = filter_(exact.record) if filter_ else True
            return {"kind": "exact", "id": normalized} if (visible and matches_filter) else {"kind": "none"}

        lower_prefix = normalized.lower()
        matches: list[str] = []
        for id_, entry in self._pending.items():
            if not include_resolved and entry.record.resolved_at_s is not None:
                continue
            if filter_ and not filter_(entry.record):
                continue
            if id_.lower().startswith(lower_prefix):
                matches.append(id_)

        if len(matches) == 1:
            return {"kind": "prefix", "id": matches[0]}
        if len(matches) > 1:
            return {"kind": "ambiguous", "ids": matches}
        return {"kind": "none"}

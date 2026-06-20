"""Bounded, staleness-aware send queue for a possibly-disconnected WebSocket.

Origin:  EvanBacon/serve-sim, packages/serve-sim/src/client/utils/ws-send-queue.ts
         (Apache-2.0) -- https://github.com/EvanBacon/serve-sim, npm package
         "serve-sim" v0.1.34. Provided as a source zip snapshot (no pinned
         commit SHA available).
Ported:  2026-06-20. Direct translation -- pure functions over a plain list,
         no deps. `encodeWsMessage`'s binary tag-prefix framing was kept as
         an optional helper; callers free to send `payload` as plain JSON
         instead if their transport doesn't use that wire format.
License: Apache-2.0 (see vendor/serve-sim/_upstream/LICENSE)

Purpose: while a WebSocket is reconnecting, queue outbound messages instead
of dropping them, but bound the queue (count + age) so a long outage does
not silently replay a backlog of stale commands once the socket reopens --
directly relevant to Yana AI's agent-communication-policy.md mailbox model
(bounded, TTL'd message delivery) for any live/streaming UI feature.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Protocol

WS_OPEN_READY_STATE = 1

DEFAULT_MAX_QUEUE_SIZE = 32
DEFAULT_MAX_QUEUE_AGE_MS = 1_500


@dataclass(frozen=True)
class QueuedWsMessage:
    tag: int
    payload: dict[str, Any]
    created_at: float


class WsSendTarget(Protocol):
    ready_state: int

    def send(self, data: bytes) -> None: ...


def encode_ws_message(tag: int, payload: dict[str, Any]) -> bytes:
    body = json.dumps(payload).encode("utf-8")
    return bytes([tag]) + body


def enqueue_ws_message(
    queue: list[QueuedWsMessage], message: QueuedWsMessage, max_queue_size: int = DEFAULT_MAX_QUEUE_SIZE
) -> list[QueuedWsMessage]:
    next_queue = [*queue, message]
    if len(next_queue) > max_queue_size:
        return next_queue[len(next_queue) - max_queue_size :]
    return next_queue


def flush_ws_message_queue(
    ws: WsSendTarget | None,
    queue: list[QueuedWsMessage],
    now: float,
    max_queue_age_ms: float = DEFAULT_MAX_QUEUE_AGE_MS,
) -> list[QueuedWsMessage]:
    fresh = [m for m in queue if now - m.created_at <= max_queue_age_ms]
    if ws is None or ws.ready_state != WS_OPEN_READY_STATE:
        return fresh
    for message in fresh:
        ws.send(encode_ws_message(message.tag, message.payload))
    return []


def send_or_queue_ws_message(
    ws: WsSendTarget | None,
    queue: list[QueuedWsMessage],
    tag: int,
    payload: dict[str, Any],
    now: float,
) -> list[QueuedWsMessage]:
    fresh = flush_ws_message_queue(ws, queue, now)
    if ws is not None and ws.ready_state == WS_OPEN_READY_STATE:
        ws.send(encode_ws_message(tag, payload))
        return fresh
    return enqueue_ws_message(fresh, QueuedWsMessage(tag=tag, payload=payload, created_at=now))

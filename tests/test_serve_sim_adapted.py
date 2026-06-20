"""Tests for the serve-sim_adapted batch (keyboard/port/ws-queue/token utils).

Origin: core/lib/serve_sim_adapted/*.py
        (ported from EvanBacon/serve-sim, Apache-2.0)
"""
import socket
import time

from core.lib.serve_sim_adapted.constant_time_token_match import tokens_match
from core.lib.serve_sim_adapted.ports import get_port_holders, kill_port_holder
from core.lib.serve_sim_adapted.text_to_keys import (
    UnsupportedCharacterError,
    US_KEYBOARD_MAP,
    text_to_key_events,
)
from core.lib.serve_sim_adapted.ws_send_queue import (
    QueuedWsMessage,
    WS_OPEN_READY_STATE,
    flush_ws_message_queue,
    send_or_queue_ws_message,
)

import pytest


# -- text_to_keys --


def test_text_to_key_events_lowercase_letter():
    events = text_to_key_events("a")
    assert events == [
        type(events[0])("down", US_KEYBOARD_MAP["a"].usage),
        type(events[0])("up", US_KEYBOARD_MAP["a"].usage),
    ]


def test_text_to_key_events_uppercase_adds_shift():
    events = text_to_key_events("A")
    assert events[0].type == "down" and events[0].usage == 0xE1  # shift down
    assert events[-1].type == "up" and events[-1].usage == 0xE1  # shift up


def test_text_to_key_events_raises_on_unsupported_char():
    with pytest.raises(UnsupportedCharacterError):
        text_to_key_events("é")  # accented e, not on US layout


def test_text_to_key_events_ignores_lone_cr():
    events = text_to_key_events("a\rb")
    # \r contributes nothing; only a and b produce events
    assert len(events) == 4


# -- ports --


def test_get_port_holders_empty_for_free_port():
    assert get_port_holders(54399) == []


def test_get_port_holders_excludes_self():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 54398))
        s.listen(1)
        time.sleep(0.05)
        assert get_port_holders(54398) == []
    finally:
        s.close()


def test_kill_port_holder_noop_when_nothing_listening():
    kill_port_holder(54397)  # must not raise


# -- constant_time_token_match --


def test_tokens_match_equal():
    assert tokens_match("abc123", "abc123") is True


def test_tokens_match_different():
    assert tokens_match("abc123", "xyz789") is False


def test_tokens_match_different_lengths():
    assert tokens_match("a", "aa") is False


# -- ws_send_queue --


class _FakeWs:
    def __init__(self, ready_state: int):
        self.ready_state = ready_state
        self.sent: list[bytes] = []

    def send(self, data: bytes) -> None:
        self.sent.append(data)


def test_send_queues_while_closed_then_flushes_on_reconnect():
    closed = _FakeWs(0)
    queue = send_or_queue_ws_message(closed, [], 1, {"a": 1}, now=0)
    assert len(queue) == 1
    assert closed.sent == []

    opened = _FakeWs(WS_OPEN_READY_STATE)
    queue = send_or_queue_ws_message(opened, queue, 2, {"b": 2}, now=100)
    assert len(opened.sent) == 2
    assert queue == []


def test_flush_evicts_stale_messages():
    stale = QueuedWsMessage(tag=1, payload={}, created_at=0)
    fresh_queue = flush_ws_message_queue(None, [stale], now=10_000, max_queue_age_ms=1_500)
    assert fresh_queue == []


def test_send_immediately_when_ws_open():
    open_ws = _FakeWs(WS_OPEN_READY_STATE)
    queue = send_or_queue_ws_message(open_ws, [], 1, {"x": 1}, now=0)
    assert queue == []
    assert len(open_ws.sent) == 1

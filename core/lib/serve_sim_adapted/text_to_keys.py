"""US-keyboard text to USB HID keyboard-event sequence converter.

Origin:  EvanBacon/serve-sim, packages/serve-sim/src/text-to-keys.ts (Apache-2.0)
         https://github.com/EvanBacon/serve-sim -- npm package "serve-sim" v0.1.34.
         Provided as a source zip snapshot (not a pinned git fetch), so no
         exact commit SHA is available; package.json version pinned instead.
Ported:  2026-06-20. Direct translation of the pure mapping/event-generation
         logic (US_KEYBOARD_MAP, textToKeyEvents). `sendKeyEventsToWs` (the
         WebSocket transport for the events) was NOT ported -- that's
         specific to serve-sim's own WS wire protocol/opcode, not a generic
         algorithm.
License: Apache-2.0 (see vendor/serve-sim/_upstream/LICENSE)

Purpose: maps text characters to USB HID Usage Page 0x07 keyboard usage
codes (down/up event pairs, with shift handling) -- a generically reusable
building block for any keyboard-input-simulation feature, independent of
serve-sim's specific transport.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

LEFT_SHIFT = 0xE1


@dataclass(frozen=True)
class KeySpec:
    usage: int
    shift: bool


def _build_map() -> dict[str, KeySpec]:
    key_map: dict[str, KeySpec] = {}

    for i in range(26):
        usage = 0x04 + i
        key_map[chr(0x61 + i)] = KeySpec(usage, False)  # a-z
        key_map[chr(0x41 + i)] = KeySpec(usage, True)  # A-Z

    digits = "1234567890"
    digits_shifted = "!@#$%^&*()"
    for i in range(10):
        usage = 0x1E + i
        key_map[digits[i]] = KeySpec(usage, False)
        key_map[digits_shifted[i]] = KeySpec(usage, True)

    rest: list[tuple[str, str, int]] = [
        ("-", "_", 0x2D),
        ("=", "+", 0x2E),
        ("[", "{", 0x2F),
        ("]", "}", 0x30),
        ("\\", "|", 0x31),
        (";", ":", 0x33),
        ("'", '"', 0x34),
        ("`", "~", 0x35),
        (",", "<", 0x36),
        (".", ">", 0x37),
        ("/", "?", 0x38),
    ]
    for plain, shifted, usage in rest:
        key_map[plain] = KeySpec(usage, False)
        key_map[shifted] = KeySpec(usage, True)

    key_map[" "] = KeySpec(0x2C, False)
    key_map["\n"] = KeySpec(0x28, False)  # Enter
    key_map["\t"] = KeySpec(0x2B, False)  # Tab

    return key_map


US_KEYBOARD_MAP: dict[str, KeySpec] = _build_map()


@dataclass(frozen=True)
class KeyEvent:
    type: Literal["down", "up"]
    usage: int


class UnsupportedCharacterError(ValueError):
    def __init__(self, char: str) -> None:
        self.char = char
        super().__init__(f"Unsupported character: {char!r}")


def text_to_key_events(text: str) -> list[KeyEvent]:
    """Returns the events needed to type `text`, or raises on unsupported chars.

    Each character emits (optional shift down) -> key down -> key up -> (optional shift up).
    """
    events: list[KeyEvent] = []
    for ch in text:
        if ch == "\r":  # Normalize CRLF / lone CR to a single Enter press.
            continue
        spec = US_KEYBOARD_MAP.get(ch)
        if spec is None:
            raise UnsupportedCharacterError(ch)
        if spec.shift:
            events.append(KeyEvent("down", LEFT_SHIFT))
        events.append(KeyEvent("down", spec.usage))
        events.append(KeyEvent("up", spec.usage))
        if spec.shift:
            events.append(KeyEvent("up", LEFT_SHIFT))
    return events

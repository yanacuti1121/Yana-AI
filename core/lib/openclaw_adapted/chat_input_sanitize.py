"""Chat send input sanitizer.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/gateway/chat-input-sanitize.ts (MIT)
Ported:  2026-06-20. Direct, verbatim translation -- pure function, no deps.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass

NULL_BYTE = chr(0)


def _strip_disallowed_chat_control_chars(message: str) -> str:
    """Drop disallowed control characters while preserving tab and line breaks."""
    output_chars = []
    for char in message:
        code = ord(char)
        if code == 9 or code == 10 or code == 13 or (code >= 32 and code != 127):
            output_chars.append(char)
    return "".join(output_chars)


@dataclass(frozen=True)
class ChatSendSanitizeResult:
    ok: bool
    message: str = ""
    error: str = ""


def sanitize_chat_send_message_input(message: str) -> ChatSendSanitizeResult:
    """Normalize chat text and reject null bytes before routing to channels."""
    normalized = unicodedata.normalize("NFC", message)
    if NULL_BYTE in normalized:
        return ChatSendSanitizeResult(ok=False, error="message must not contain null bytes")
    return ChatSendSanitizeResult(ok=True, message=_strip_disallowed_chat_control_chars(normalized))

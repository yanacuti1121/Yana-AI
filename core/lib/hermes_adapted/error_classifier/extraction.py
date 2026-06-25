"""Pull status code / body / error code / message out of an SDK exception.

Origin: NousResearch/hermes-agent agent/error_classifier.py (MIT) — see
        core/lib/hermes_adapted/error_classifier/__init__.py for port notes.
"""
from __future__ import annotations

import json
from typing import Optional


def extract_status_code(error: Exception) -> Optional[int]:
    """Walk the error and its cause chain to find an HTTP status code."""
    current = error
    for _ in range(5):  # Max depth to prevent infinite loops
        code = getattr(current, "status_code", None)
        if isinstance(code, int):
            return code
        # Some SDKs use .status instead of .status_code
        code = getattr(current, "status", None)
        if isinstance(code, int) and 100 <= code < 600:
            return code
        # Walk cause chain
        cause = getattr(current, "__cause__", None) or getattr(current, "__context__", None)
        if cause is None or cause is current:
            break
        current = cause
    return None


def extract_error_body(error: Exception) -> dict:
    """Extract the structured error body from an SDK exception."""
    body = getattr(error, "body", None)
    if isinstance(body, dict):
        return body
    # Some errors have .response.json()
    response = getattr(error, "response", None)
    if response is not None:
        try:
            json_body = response.json()
            if isinstance(json_body, dict):
                return json_body
        except Exception:
            pass
    return {}


def _code_from_payload(payload) -> str:
    """Extract a code/type from a nested error payload dict (defensive)."""
    if not isinstance(payload, dict):
        return ""
    payload_error = payload.get("error", {})
    if isinstance(payload_error, dict):
        nested = payload_error.get("code") or payload_error.get("type") or ""
        if isinstance(nested, str) and nested.strip() and nested.strip() != "400":
            return nested.strip()
    code = payload.get("code") or payload.get("error_code") or ""
    if isinstance(code, (str, int)):
        text = str(code).strip()
        if text and text != "400":
            return text
    return ""


def _nested_code_from_message(message: object) -> str:
    """Peek into a stringified-JSON error.message for a nested code."""
    if not isinstance(message, str) or not message.strip().startswith("{"):
        return ""
    try:
        inner = json.loads(message)
    except (json.JSONDecodeError, TypeError):
        return ""
    return _code_from_payload(inner)


def extract_error_code(body: dict) -> str:
    """Extract an error code string from the response body."""
    if not body:
        return ""

    error_obj = body.get("error", {})
    if isinstance(error_obj, dict):
        code = error_obj.get("code") or error_obj.get("type") or ""
        if isinstance(code, str) and code.strip() and code.strip() != "400":
            return code.strip()

        # Some providers wrap the real JSON error body as a string inside
        # error.message — peek into it for a nested code (e.g. Responses API
        # surfaces ``invalid_encrypted_content`` this way).
        nested_code = _nested_code_from_message(error_obj.get("message"))
        if nested_code:
            return nested_code

    # Top-level code
    code = body.get("code") or body.get("error_code") or ""
    if isinstance(code, (str, int)):
        text = str(code).strip()
        if text and text != "400":
            return text
    return ""


def extract_message(error: Exception, body: dict) -> str:
    """Extract the most informative error message."""
    # Try structured body first
    if body:
        error_obj = body.get("error", {})
        if isinstance(error_obj, dict):
            msg = error_obj.get("message", "")
            if isinstance(msg, str) and msg.strip():
                return msg.strip()[:500]
        msg = body.get("message", "")
        if isinstance(msg, str) and msg.strip():
            return msg.strip()[:500]
    # Fallback to str(error)
    return str(error)[:500]

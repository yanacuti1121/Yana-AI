"""Build the combined lowercase error-message string used for pattern matching.

Origin: NousResearch/hermes-agent agent/error_classifier.py (MIT) — see
        core/lib/hermes_adapted/error_classifier/__init__.py for port notes.
"""
from __future__ import annotations

import json


def _inner_metadata_message(metadata: dict) -> str:
    """Parse OpenRouter's metadata.raw (stringified JSON) for the real message."""
    raw_json = metadata.get("raw") or ""
    if not isinstance(raw_json, str) or not raw_json.strip():
        return ""
    try:
        inner = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return ""
    if not isinstance(inner, dict):
        return ""
    inner_err = inner.get("error", {})
    if isinstance(inner_err, dict):
        return str(inner_err.get("message") or "").lower()
    return ""


def _body_and_metadata_messages(body: dict) -> tuple[str, str]:
    """Extract (error.message, metadata.raw inner message) from a body dict."""
    body_msg = ""
    metadata_msg = ""
    err_obj = body.get("error", {})
    if isinstance(err_obj, dict):
        body_msg = str(err_obj.get("message") or "").lower()
        metadata = err_obj.get("metadata", {})
        if isinstance(metadata, dict):
            metadata_msg = _inner_metadata_message(metadata)
    if not body_msg:
        body_msg = str(body.get("message") or "").lower()
    return body_msg, metadata_msg


def build_error_message(error: Exception, body: dict) -> str:
    """Combine the exception string, body message, and wrapped-provider
    metadata message into one lowercase string for pattern matching.

    str(error) alone may not include the body message (e.g. OpenAI SDK's
    APIStatusError.__str__ returns the first arg, not the body).  OpenRouter
    also wraps upstream provider errors inside metadata.raw — the real error
    message (e.g. "context length exceeded") may only be in that inner JSON.
    """
    raw_msg = str(error).lower()
    body_msg = ""
    metadata_msg = ""
    if isinstance(body, dict):
        body_msg, metadata_msg = _body_and_metadata_messages(body)

    parts = [raw_msg]
    if body_msg and body_msg not in raw_msg:
        parts.append(body_msg)
    if metadata_msg and metadata_msg not in raw_msg and metadata_msg not in body_msg:
        parts.append(metadata_msg)
    return " ".join(parts)

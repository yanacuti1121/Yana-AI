"""Payload-size and multimodal-tool-content message patterns.

Origin: NousResearch/hermes-agent agent/error_classifier.py (MIT) — see
        core/lib/hermes_adapted/error_classifier/__init__.py for port notes.
"""
from __future__ import annotations

# Payload-too-large patterns detected from message text (no status_code attr).
# Proxies and some backends embed the HTTP status in the error message.
PAYLOAD_TOO_LARGE_PATTERNS = [
    "request entity too large",
    "payload too large",
    "error code: 413",
]

# Image-size patterns.  Matched against 400 bodies (not 413) because most
# providers return a 400 with a specific image-too-big message before the
# whole request hits the 413 size limit.  Anthropic's wording is the most
# important here (hard 5 MB per image, returned as
# "messages.N.content.K.image.source.base64: image exceeds 5 MB maximum").
IMAGE_TOO_LARGE_PATTERNS = [
    "image exceeds",        # Anthropic: "image exceeds 5 MB maximum"
    "image too large",      # generic
    "image_too_large",      # error_code variant
    "image size exceeds",   # variant
    "image dimensions exceed",  # Anthropic: "image dimensions exceed max allowed size: 8000 pixels"
    "dimensions exceed max allowed size",  # Anthropic dimension-cap (wording variant)
    "max allowed size: 8000",  # Anthropic dimension-cap (explicit pixel ceiling)
    # "request_too_large" on a request known to contain an image → image is
    # the likely culprit; we still try the shrink path before giving up.
]

# Providers that follow the OpenAI spec strictly require tool message
# ``content`` to be a string.  Some (Anthropic native, Codex Responses,
# Gemini native, first-party OpenAI) extend this to accept a content-parts
# list (text + image_url) so screenshots from computer_use survive.  Others
# (Xiaomi MiMo, some Alibaba endpoints, a long tail of OpenAI-compatible
# providers) reject the list with a 400 — the patterns below are the most
# common error shapes we see.  Recovery: strip image parts from tool
# messages in-place, record the (provider, model) for the rest of the
# session so we don't waste another call learning the same lesson, retry.
#
# See: https://github.com/NousResearch/hermes-agent/issues/27344
MULTIMODAL_TOOL_CONTENT_PATTERNS = [
    # Xiaomi MiMo: {"error":{"code":"400","message":"Param Incorrect","param":"text is not set"}}
    "text is not set",
    # Generic "tool message must be string" shapes
    "tool message content must be a string",
    "tool content must be a string",
    "tool message must be a string",
    # OpenAI-compat servers that reject list-type tool content with a
    # schema-validation message
    "expected string, got list",
    "expected string, got array",
    # Alibaba/DashScope variant
    "tool_call.content must be string",
]

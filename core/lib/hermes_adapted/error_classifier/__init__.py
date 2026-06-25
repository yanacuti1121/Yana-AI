"""API error classification for smart failover and recovery — near-faithful port.

Origin:  NousResearch/hermes-agent @ 5378b941209d8f62a65455041658ce8ce8144cc9
         agent/error_classifier.py (MIT License)
Ported:  2026-06-25. Split into multiple files to satisfy this repo's
         300-line-per-file / 50-line-per-function hard limits (the upstream
         file is ~1365 lines in one block) — pure mechanical decomposition,
         no behavioral change. The single public entry point and its return
         types are re-exported here so callers don't need to know about the
         internal module layout.
License: MIT (see vendor/hermes-agent/_upstream/LICENSE)
"""
from __future__ import annotations

from core.lib.hermes_adapted.error_classifier.classify import classify_api_error
from core.lib.hermes_adapted.error_classifier.taxonomy import (
    ClassifiedError,
    FailoverReason,
)

__all__ = ["classify_api_error", "ClassifiedError", "FailoverReason"]

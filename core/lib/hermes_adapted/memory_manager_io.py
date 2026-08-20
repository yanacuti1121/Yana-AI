"""Yana-specific glue for memory_manager.py -- turn auto-capture (Phase 5a).

Not a port: memory_manager.py/memory_manager_lifecycle.py stay untouched (see
their own docstrings). This module is new Yana code, same category as
context_compressor_io.py and tool_guardrails_io.py, bridging two gaps for
core/hooks/memory-turn-sync-stop.sh:

  - a MemoryProvider implementation -- memory_manager.py has none; upstream's
    real providers are hermes-product-specific and out of scope for this port
  - locating "the last turn" in a Claude Code transcript and appending it to
    a local append-only log

Scope (Phase 5a, write path only): implements sync_turn() for real. The rest
of the MemoryProvider Protocol -- prefetch, get_tool_schemas, handle_tool_call,
on_turn_start, on_session_end, on_session_switch, on_pre_compress,
on_memory_write, on_delegation -- has no Yana wiring point yet. Several of
them (get_tool_schemas/handle_tool_call especially) assume a live, persistent
agent loop that can accept a dynamically-registered tool mid-conversation,
which Yana does not have -- every hook invocation is a fresh process reacting
to one event, not a long-running loop. Stubbed rather than implemented so
MemoryManager.add_provider()'s Protocol expectations are met without
pretending those integration points exist.

No embedding computation here either -- embeddings only have value once
something searches them, and prefetch (the search side) is a separate, later
phase. This phase only captures text; a future phase can compute embeddings
from the log this writes without needing to change this module's format.
"""
from __future__ import annotations

import fcntl
import json
import re
import time
from typing import Any, Dict, List

from core.lib.hermes_adapted.context_compressor_io import parse_transcript_to_messages
from core.lib.hermes_adapted.context_compressor_pairs import (
    find_last_assistant_message_idx,
    find_last_user_message_idx,
)
from core.lib.hermes_adapted.memory_manager import MemoryManager

# Per-side cap on captured turn text -- generous enough to keep a real turn's
# substance, bounded so one huge turn can't blow up the log file. No existing
# precedent for this exact number in this file family (context_compressor_io.py
# and tool_guardrails_io.py truncate for different reasons); picked in the
# same order of magnitude as diagnostics.ts's MAX_TEXT=2000 with headroom for
# conversational text typically running longer than a single stack trace.
MAX_TURN_TEXT_CHARS = 4000

# Matches tool_guardrails_io.py / context_compressor_io.py's existing
# stale-entry window.
STALE_LOG_SECONDS = 6 * 60 * 60
MAX_LOG_ENTRIES = 2000

# Same secret-signal pattern this repo already uses in two places for
# automatic/semi-automatic content capture -- core/hooks/audit-log.sh's
# whole-blob redaction (SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|BEARER)
# unioned with core/scripts/add-fact.sh's L1-fact rejection pattern (adds
# CREDENTIAL, and the underscore/hyphen variants for API_KEY/PRIVATE_KEY).
# Per 52-secrets-vault-law.md ("no agent may store raw secrets") and
# 68-principal-confidentiality-law.md (default-deny on anything sensitive),
# this hook captures raw conversation text automatically and unconditionally
# on every turn -- unlike add-fact.sh (a human/agent deliberately choosing to
# write one fact) it has no other point where a human reviews the content
# before it's persisted, so it needs its own filter rather than relying on
# the caller to have already checked.
_SECRET_PATTERN = re.compile(
    r"(SECRET|TOKEN|PASSWORD|API[_-]?KEY|PRIVATE[_-]?KEY|BEARER|CREDENTIAL)",
    re.IGNORECASE,
)


def _redact_if_secret_like(text: str) -> str:
    """Whole-text redaction (not surgical substring removal) on any secret
    signal -- same blunt approach audit-log.sh already uses for the same
    reason: a substring redaction can leave enough surrounding context
    (variable names, half a key) to still be useful to whoever reads the
    log, and a false positive here just means one turn's text is replaced
    with a placeholder, not lost data anyone depends on for correctness."""
    if _SECRET_PATTERN.search(text):
        return "[REDACTED — possible secret/credential]"
    return text


class LocalTurnLogProvider:
    """MemoryProvider that appends each turn's text to a local JSONL log.

    Only sync_turn() is real -- see module docstring for why the rest are
    stubs. name="local_turn_log", not "builtin", so MemoryManager treats it
    as the one external provider slot.
    """

    name = "local_turn_log"

    def __init__(self, log_path: str) -> None:
        self._log_path = log_path

    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None:
        entry = {
            "session_id": session_id,
            "timestamp": time.time(),
            "user_text": _redact_if_secret_like(user_content[:MAX_TURN_TEXT_CHARS]),
            "assistant_text": _redact_if_secret_like((assistant_content or "")[:MAX_TURN_TEXT_CHARS]),
        }
        _append_and_prune(self._log_path, entry)

    # -- Stubs: no Yana wiring point yet (see module docstring) -------------

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        return ""

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        return []

    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs: Any) -> str:
        return json.dumps({"error": f"local_turn_log does not handle tool calls ({tool_name})"})

    def on_turn_start(self, turn_number: int, message: str, **kwargs: Any) -> None:
        pass

    def on_session_end(self, messages: List[Dict[str, Any]]) -> None:
        pass

    def on_session_switch(self, new_session_id: str, **kwargs: Any) -> None:
        pass

    def on_pre_compress(self, messages: List[Dict[str, Any]]) -> str:
        return ""

    def on_memory_write(self, action: str, target: str, content: str, **kwargs: Any) -> None:
        pass

    def on_delegation(self, task: str, result: str, **kwargs: Any) -> None:
        pass


def _prune_entries(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Drop entries older than STALE_LOG_SECONDS, then cap total count --
    same two-part pruning shape as context_compressor_io.py's
    prune_stale_sessions, applied to a flat list instead of a session dict."""
    now = time.time()
    fresh = [e for e in entries if now - e.get("timestamp", now) <= STALE_LOG_SECONDS]
    if len(fresh) > MAX_LOG_ENTRIES:
        fresh = fresh[-MAX_LOG_ENTRIES:]
    return fresh


def _append_and_prune(log_path: str, entry: Dict[str, Any]) -> None:
    """Append one entry under an exclusive lock, pruning stale/excess entries
    in the same read-modify-write pass -- same fcntl.flock convention as
    context_compressor_io.py's dump_state/load_compressor (Python fcntl, not
    the `flock` CLI -- not preinstalled on macOS). No try/except around the
    file open here, matching context_compressor_io.py's own state-file
    handling: the caller (core/hooks/memory-turn-sync-stop.sh) backgrounds
    this call with stderr redirected to /dev/null, so a genuine I/O failure
    here fails this one sync attempt quietly without needing a second layer
    of protection."""
    with open(log_path, "a+", encoding="utf-8") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.seek(0)
        existing: List[Dict[str, Any]] = []
        for line in f.readlines():
            line = line.strip()
            if not line:
                continue
            try:
                existing.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        existing.append(entry)
        pruned = _prune_entries(existing)

        f.seek(0)
        f.truncate()
        for e in pruned:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")


def sync_last_turn(transcript_path: str, session_id: str, log_path: str) -> bool:
    """Find the last real user/assistant turn pair in a transcript and
    capture it via LocalTurnLogProvider. Returns False on: no transcript
    (parse_transcript_to_messages already fails open to []), or no user
    message found -- both are normal "nothing to sync yet" states, not
    errors."""
    messages = parse_transcript_to_messages(transcript_path)
    if not messages:
        return False

    user_idx = find_last_user_message_idx(messages, 0)
    if user_idx < 0:
        return False
    user_text = messages[user_idx].get("content")
    if not isinstance(user_text, str) or not user_text.strip():
        return False

    assistant_text = ""
    # head_end=user_idx, not 0: context_compressor.py's own callers use this
    # function to find the globally most recent reply regardless of which
    # turn it belongs to (for tail-anchoring during compression), but this
    # caller needs THIS turn's own reply. Passing 0 would let an older,
    # unrelated content-bearing reply win when the current turn's own
    # assistant message is tool_use-only (no text yet) -- silently pairing
    # the current question with a stale answer from an earlier turn.
    assistant_idx = find_last_assistant_message_idx(messages, user_idx)
    if assistant_idx >= 0:
        content = messages[assistant_idx].get("content")
        if isinstance(content, str):
            assistant_text = content

    manager = MemoryManager()
    manager.add_provider(LocalTurnLogProvider(log_path))
    manager.sync_all(user_text, assistant_text, session_id=session_id)
    # sync_all() dispatches to a background single-worker executor -- this
    # process exits right after the hook's python3 -c call returns, so the
    # write must be waited on here or it may never happen. flush_pending()
    # submits a no-op and waits on it; the single-worker executor guarantees
    # everything submitted before it (our sync_turn call) has already run.
    manager.flush_pending(timeout=5.0)
    return True

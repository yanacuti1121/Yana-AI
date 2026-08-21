"""Yana-specific glue for memory_manager.py -- turn auto-capture + recall.

Not a port: memory_manager.py/memory_manager_lifecycle.py stay untouched (see
their own docstrings). This module is new Yana code, same category as
context_compressor_io.py and tool_guardrails_io.py, bridging two gaps:

  - a MemoryProvider implementation -- memory_manager.py has none; upstream's
    real providers are hermes-product-specific and out of scope for this port
  - Claude-Code-specific plumbing: locating "the last turn" in a transcript
    (for core/hooks/memory-turn-sync-stop.sh, Phase 5a) and embedding-based
    search over the resulting log (for core/hooks/memory-recall-prompt.sh,
    Phase 5b)

Phase 5a (write path, sync_turn) and Phase 5b (read path, prefetch) are both
implemented for real now. The rest of the MemoryProvider Protocol --
get_tool_schemas, handle_tool_call, on_turn_start, on_session_end,
on_session_switch, on_pre_compress, on_memory_write, on_delegation -- still
has no Yana wiring point. Several of them (get_tool_schemas/handle_tool_call
especially) assume a live, persistent agent loop that can accept a
dynamically-registered tool mid-conversation, which Yana does not have --
every hook invocation is a fresh process reacting to one event, not a
long-running loop. Stubbed rather than implemented so
MemoryManager.add_provider()'s Protocol expectations are met without
pretending those integration points exist.

Phase 5b design note (why prefetch() rate-limits its own embedding backfill):
prefetch() runs from a UserPromptSubmit hook, which blocks the user's turn
until it returns -- unlike the Stop-triggered write path, it cannot afford an
unbounded number of Ollama calls. See MAX_EMBEDDINGS_PER_PREFETCH below.
"""
from __future__ import annotations

import fcntl
import json
import math
import re
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

from core.lib.hermes_adapted.context_compressor_io import parse_transcript_to_messages
from core.lib.hermes_adapted.context_compressor_pairs import (
    find_last_assistant_message_idx,
    find_last_user_message_idx,
)
from core.lib.hermes_adapted.memory_manager import MemoryManager
from core.lib.hermes_adapted.mojo_vector_recall import (
    cosine_similarity as _cosine_similarity,
    cosine_scores,
    vector_norm,
)

CacheKey = Tuple[str, float]
CacheValue = Tuple[List[float], float]

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

# Phase 5b -- recall. Same default embedding model tools/yana-web/embeddings.js
# already uses (YANA_EMBED_MODEL env var name matches that file too, so one
# model choice governs both stacks even though no code is shared between
# them). Short timeout (vs. context_compressor_io.py's 60s Ollama summarize
# call) because this runs on the UserPromptSubmit path, which must stay fast
# -- a hung Ollama here should fail fast, not hold up the user's turn.
#
# EMBED_TIMEOUT_SECONDS * (1 query call + MAX_EMBEDDINGS_PER_PREFETCH backfill
# calls) is this module's own worst-case latency budget for one prefetch()
# call -- it must stay comfortably under YANA_HOOK_TIMEOUT (hook-timeout-guard.sh's
# hard kill ceiling, 30s default), not just rely on that external guard as
# the only backstop. 3.0 * (1 + 5) = 18s, leaving headroom for the rest of
# the hook (jq parsing, file I/O) under the 30s default. This is the
# pathological case (Ollama running but hung on every call, not simply
# down -- a down Ollama fails each call near-instantly on connection
# refused, not after the full timeout).
DEFAULT_EMBED_MODEL = "nomic-embed-text"
DEFAULT_OLLAMA_HOST = "http://localhost:11434"
EMBED_TIMEOUT_SECONDS = 3.0
MAX_EMBEDDINGS_PER_PREFETCH = 5

TOP_K_RESULTS = 3
# Not empirically tuned against real nomic-embed-text output distributions
# yet -- a starting point (loose enough to surface plausible matches,
# tight enough that an unrelated prompt returns nothing). Revisit once this
# has run against real usage.
MIN_SIMILARITY = 0.5

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


def embed_text(text: str, model: str, host: str,
                timeout_seconds: float = EMBED_TIMEOUT_SECONDS) -> Optional[List[float]]:
    """Call Ollama's /api/embeddings. Mirrors context_compressor_io.py's
    build_ollama_summarize_fn's exact urllib/timeout/exception-swallowing
    shape (same file family, same reasoning), pointed at a different
    endpoint -- confirmed against tools/yana-web/embeddings.js's working
    implementation of the same call. Returns None on any failure (network,
    timeout, malformed response, Ollama not running) -- never raises."""
    payload = json.dumps({"model": model, "prompt": text}).encode("utf-8")
    req = urllib.request.Request(
        f"{host}/api/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    embedding = body.get("embedding")
    if isinstance(embedding, list) and embedding and all(isinstance(x, (int, float)) for x in embedding):
        return embedding
    return None


def _entry_key(entry: Dict[str, Any]) -> CacheKey:
    """memory-turn-log.jsonl entries have no stable id -- (session_id,
    timestamp) is unique enough in practice to key the embedding cache
    against without adding an id field to Phase 5a's already-shipped
    format.

    Collision note: two sync_turn() calls in the same session producing an
    identical time.time() float would collide on this key -- the backfill
    loop in _sync_embedding_cache treats the first one as already cached
    and never re-embeds the second, so the second entry's relevance score
    would silently be computed against the first entry's embedding rather
    than its own text (the displayed Q:/A: text stays correct either way,
    since that always comes from the log entry itself, not the cache).
    time.time()'s sub-microsecond resolution and sync_turn() normally
    firing once per Stop event make this low-probability in practice, not
    eliminated -- accepted rather than solved by adding a real id field,
    since that would mean a schema change to Phase 5a's already-shipped,
    already-reviewed log format."""
    return (entry.get("session_id", ""), entry.get("timestamp", 0.0))


def _read_jsonl(path: str) -> List[Dict[str, Any]]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return []
    entries: List[Dict[str, Any]] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return entries


def _sync_embedding_cache(cache_path: str, log_entries: List[Dict[str, Any]],
                           embed_fn, max_backfill: int) -> Dict[CacheKey, CacheValue]:
    """Read the embedding cache, drop entries whose source log entry no
    longer exists (the source log is pruned independently by
    _prune_entries/_append_and_prune -- without this the cache would grow
    unbounded on its own separate schedule), backfill up to max_backfill
    missing embeddings via embed_fn, write the result back -- all under one
    exclusive lock, same fcntl.flock convention as _append_and_prune, so a
    concurrent prefetch call (e.g. two Claude Code sessions in the same
    repo) can't race a read-modify-write against this one."""
    with open(cache_path, "a+", encoding="utf-8") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.seek(0)
        cache: Dict[CacheKey, CacheValue] = {}
        for line in f.readlines():
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            embedding = entry.get("embedding")
            # Validate numeric elements the same way embed_text() does for
            # a freshly-fetched vector, not just "is a list" -- a corrupted
            # cache file could otherwise carry a non-numeric value all the
            # way into cosine_scores()'s Python or Mojo arithmetic. The real
            # caller (recall_for_prompt -> MemoryManager.prefetch_all)
            # already wraps this in a try/except, but LocalTurnLogProvider
            # should not rely entirely on being called through that wrapper.
            if isinstance(embedding, list) and embedding and all(
                isinstance(x, (int, float)) for x in embedding
            ):
                stored_norm = entry.get("norm")
                norm = vector_norm(embedding)
                if isinstance(stored_norm, (int, float)):
                    try:
                        cached_norm = float(stored_norm)
                    except (OverflowError, ValueError):
                        pass
                    else:
                        if math.isfinite(cached_norm) and cached_norm >= 0.0:
                            norm = cached_norm
                cache[_entry_key(entry)] = (embedding, norm)

        valid_keys = {_entry_key(e) for e in log_entries}
        cache = {k: v for k, v in cache.items() if k in valid_keys}

        # Rate limit counts ATTEMPTS, not successes. A hung (not merely
        # down) Ollama server makes embed_fn return None repeatedly --
        # counting only successes would leave this loop unbounded in
        # exactly that case, calling embed_fn on every uncached entry
        # (up to MAX_LOG_ENTRIES) instead of stopping at max_backfill.
        attempted = 0
        for entry in log_entries:
            key = _entry_key(entry)
            if key in cache or attempted >= max_backfill:
                continue
            attempted += 1
            text = f"{entry.get('user_text', '')}\n{entry.get('assistant_text', '')}"
            vec = embed_fn(text)
            if vec is not None:
                cache[key] = (vec, vector_norm(vec))

        f.seek(0)
        f.truncate()
        for (session_id, timestamp), (embedding, norm) in cache.items():
            f.write(json.dumps({
                "session_id": session_id,
                "timestamp": timestamp,
                "embedding": embedding,
                "norm": norm,
            }, ensure_ascii=False) + "\n")

    return cache


class LocalTurnLogProvider:
    """MemoryProvider that appends each turn's text to a local JSONL log.

    Only sync_turn() is real -- see module docstring for why the rest are
    stubs. name="local_turn_log", not "builtin", so MemoryManager treats it
    as the one external provider slot.
    """

    name = "local_turn_log"

    def __init__(self, log_path: str, *, embedding_cache_path: str = "",
                 embed_model: str = DEFAULT_EMBED_MODEL, ollama_host: str = DEFAULT_OLLAMA_HOST,
                 top_k: int = TOP_K_RESULTS, min_similarity: float = MIN_SIMILARITY,
                 max_backfill: int = MAX_EMBEDDINGS_PER_PREFETCH) -> None:
        self._log_path = log_path
        # Callers (core/hooks/memory-recall-prompt.sh) pass this explicitly
        # -- the fallback only exists so tests/ad-hoc construction don't need
        # to invent a path when only sync_turn() is being exercised.
        self._embedding_cache_path = embedding_cache_path or (log_path + ".embeddings.jsonl")
        self._embed_model = embed_model
        self._ollama_host = ollama_host
        self._top_k = top_k
        self._min_similarity = min_similarity
        self._max_backfill = max_backfill

    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None:
        entry = {
            "session_id": session_id,
            "timestamp": time.time(),
            "user_text": _redact_if_secret_like(user_content[:MAX_TURN_TEXT_CHARS]),
            "assistant_text": _redact_if_secret_like((assistant_content or "")[:MAX_TURN_TEXT_CHARS]),
        }
        _append_and_prune(self._log_path, entry)

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        """Embedding search over the turn log. Returns "" (not an error) on:
        empty query, Ollama unreachable, empty log, or no match above
        min_similarity -- every one of those is a normal "nothing to surface"
        state for a nice-to-have feature, not a failure to report."""
        if not query or not query.strip():
            return ""

        def _embed(text: str) -> Optional[List[float]]:
            return embed_text(text, self._embed_model, self._ollama_host)

        # Same redaction + length cap sync_turn() already applies to logged
        # text, applied here to the live query before it leaves the process
        # over the local Ollama call -- if the current prompt itself looks
        # like a secret, this degrades recall quality for that one turn
        # rather than sending the raw value anywhere, even a local socket.
        log_entries = _read_jsonl(self._log_path)
        if not log_entries:
            return ""  # nothing to compare against -- check this before
            # spending an Ollama round-trip on the query embed, not after

        safe_query = _redact_if_secret_like(query[:MAX_TURN_TEXT_CHARS])
        query_vec = _embed(safe_query)
        if query_vec is None:
            return ""

        cache = _sync_embedding_cache(
            self._embedding_cache_path, log_entries, _embed, self._max_backfill,
        )

        score_entries: List[Dict[str, Any]] = []
        score_vectors: List[List[float]] = []
        score_norms: List[float] = []
        for entry in log_entries:
            cached = cache.get(_entry_key(entry))
            if cached is None:
                continue  # not yet backfilled -- see MAX_EMBEDDINGS_PER_PREFETCH
            vec, norm = cached
            score_entries.append(entry)
            score_vectors.append(vec)
            score_norms.append(norm)

        scored: List[Tuple[float, Dict[str, Any]]] = []
        for score, entry in zip(
            cosine_scores(query_vec, score_vectors, score_norms), score_entries
        ):
            if score >= self._min_similarity:
                scored.append((score, entry))

        if not scored:
            return ""
        scored.sort(key=lambda pair: pair[0], reverse=True)

        return "\n\n".join(
            f"Q: {entry.get('user_text', '')}\nA: {entry.get('assistant_text', '')}"
            for _, entry in scored[: self._top_k]
        )

    # -- Stubs: no Yana wiring point yet (see module docstring) -------------

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


def recall_for_prompt(query: str, session_id: str, log_path: str, embedding_cache_path: str,
                       embed_model: str = DEFAULT_EMBED_MODEL,
                       ollama_host: str = DEFAULT_OLLAMA_HOST) -> str:
    """Entry point core/hooks/memory-recall-prompt.sh calls. Routes through
    MemoryManager for the same reason sync_last_turn does -- reuse the
    Protocol's own per-provider exception isolation (prefetch_all's
    try/except) rather than hand-rolling one here."""
    manager = MemoryManager()
    manager.add_provider(LocalTurnLogProvider(
        log_path, embedding_cache_path=embedding_cache_path,
        embed_model=embed_model, ollama_host=ollama_host,
    ))
    return manager.prefetch_all(query, session_id=session_id)

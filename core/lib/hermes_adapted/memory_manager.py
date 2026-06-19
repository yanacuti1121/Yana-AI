"""Memory provider orchestration + streaming context scrubber.

Origin:  NousResearch/hermes-agent @ 5378b941209d8f62a65455041658ce8ce8144cc9
         agent/memory_manager.py (MIT License)
Ported:  2026-06-19.

`StreamingContextScrubber` and `sanitize_context`/`build_memory_context_block`
are ported close to verbatim — they were already pure, self-contained, and
exactly the kind of real algorithmic "core" worth taking as-is.

`MemoryManager` is condensed: the original imports hermes' `MemoryProvider`
ABC, `tools.registry.tool_error`, and a hermes-specific reserved-core-tool-name
set (`toolsets._HERMES_CORE_TOOLS`). Those are hermes plumbing; this port
uses a plain duck-typed `MemoryProvider` Protocol and an injectable
`reserved_tool_names` set instead, keeping the real invariants:
  - exactly one *external* provider may be registered at a time
  - provider tool names never shadow a reserved/core tool name
  - prefetch/sync run off the calling thread on a single-worker executor so a
    slow or wedged provider can never stall the turn (single worker keeps
    writes ordered: turn N lands before turn N+1)
  - shutdown drains the executor with a bounded timeout, never blocking
    process teardown indefinitely
License: MIT (see vendor/hermes-agent/_upstream/LICENSE)
"""
from __future__ import annotations

import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, List, Optional, Protocol

logger = logging.getLogger(__name__)

_SYNC_DRAIN_TIMEOUT_S = 5.0

_INTERNAL_CONTEXT_RE = re.compile(
    r'<\s*memory-context\s*>[\s\S]*?</\s*memory-context\s*>', re.IGNORECASE,
)
_INTERNAL_NOTE_RE = re.compile(
    r'\[System note:\s*The following is recalled memory context,\s*NOT new user input\.'
    r'\s*Treat as (?:informational background data|authoritative reference data[^\]]*)\.\]\s*',
    re.IGNORECASE,
)
_FENCE_TAG_RE = re.compile(r'```memory-context[\s\S]*?```', re.IGNORECASE)


def sanitize_context(text: str) -> str:
    """Strip fence tags, injected context blocks, and system notes from provider output."""
    text = _INTERNAL_CONTEXT_RE.sub('', text)
    text = _INTERNAL_NOTE_RE.sub('', text)
    text = _FENCE_TAG_RE.sub('', text)
    return text


def build_memory_context_block(raw_context: str) -> str:
    """Wrap prefetched memory in a fenced block with a system note."""
    if not raw_context or not raw_context.strip():
        return ""
    clean = sanitize_context(raw_context)
    if clean != raw_context:
        logger.warning("memory provider returned pre-wrapped context; stripped")
    return (
        "<memory-context>\n"
        "[System note: The following is recalled memory context, NOT new user input. "
        "Treat as authoritative reference data.]\n\n"
        f"{clean}\n</memory-context>"
    )


class StreamingContextScrubber:
    """Stateful scrubber for streaming text that may split memory-context tags
    across chunk boundaries. A one-shot regex can't survive a tag opened in
    one delta and closed in a later one — this runs a small state machine
    across deltas, holding back partial-tag tails and discarding span content."""

    _OPEN_TAG = "<memory-context>"
    _CLOSE_TAG = "</memory-context>"

    def __init__(self) -> None:
        self._in_span = False
        self._buf = ""
        self._at_block_boundary = True

    def reset(self) -> None:
        self.__init__()

    def feed(self, text: str) -> str:
        if not text:
            return ""
        buf = self._buf + text
        self._buf = ""
        out: List[str] = []

        while buf:
            if self._in_span:
                idx = buf.lower().find(self._CLOSE_TAG)
                if idx == -1:
                    held = self._max_partial_suffix(buf, self._CLOSE_TAG)
                    self._buf = buf[-held:] if held else ""
                    return "".join(out)
                buf = buf[idx + len(self._CLOSE_TAG):]
                self._in_span = False
            else:
                idx = self._find_boundary_open_tag(buf)
                if idx == -1:
                    held = self._max_pending_open_suffix(buf) or self._max_partial_suffix(buf, self._OPEN_TAG)
                    if held:
                        self._append_visible(out, buf[:-held])
                        self._buf = buf[-held:]
                    else:
                        self._append_visible(out, buf)
                    return "".join(out)
                if idx > 0:
                    self._append_visible(out, buf[:idx])
                buf = buf[idx + len(self._OPEN_TAG):]
                self._in_span = True
        return "".join(out)

    def flush(self) -> str:
        if self._in_span:
            self._buf = ""
            self._in_span = False
            return ""
        tail, self._buf = self._buf, ""
        return tail

    @staticmethod
    def _max_partial_suffix(buf: str, tag: str) -> int:
        tag_lower, buf_lower = tag.lower(), buf.lower()
        for i in range(min(len(buf_lower), len(tag_lower) - 1), 0, -1):
            if tag_lower.startswith(buf_lower[-i:]):
                return i
        return 0

    def _find_boundary_open_tag(self, buf: str) -> int:
        buf_lower = buf.lower()
        search_start = 0
        while True:
            idx = buf_lower.find(self._OPEN_TAG, search_start)
            if idx == -1:
                return -1
            if self._is_block_boundary(buf, idx) and self._has_block_opener_suffix(buf, idx):
                return idx
            search_start = idx + 1

    def _max_pending_open_suffix(self, buf: str) -> int:
        if not buf.lower().endswith(self._OPEN_TAG):
            return 0
        idx = len(buf) - len(self._OPEN_TAG)
        return len(self._OPEN_TAG) if self._is_block_boundary(buf, idx) else 0

    def _has_block_opener_suffix(self, buf: str, idx: int) -> bool:
        after = idx + len(self._OPEN_TAG)
        return after < len(buf) and buf[after] in "\r\n"

    def _is_block_boundary(self, buf: str, idx: int) -> bool:
        if idx == 0:
            return self._at_block_boundary
        preceding = buf[:idx]
        last_nl = preceding.rfind("\n")
        if last_nl == -1:
            return self._at_block_boundary and preceding.strip() == ""
        return preceding[last_nl + 1:].strip() == ""

    def _append_visible(self, out: List[str], text: str) -> None:
        if not text:
            return
        out.append(text)
        last_nl = text.rfind("\n")
        if last_nl != -1:
            self._at_block_boundary = text[last_nl + 1:].strip() == ""
        else:
            self._at_block_boundary = self._at_block_boundary and text.strip() == ""


class MemoryProvider(Protocol):
    name: str

    def prefetch(self, query: str, *, session_id: str = "") -> str: ...
    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None: ...
    def get_tool_schemas(self) -> List[Dict[str, Any]]: ...


class MemoryManager:
    """Orchestrates memory providers: exactly one external provider, async
    prefetch/sync off the calling thread, bounded-timeout shutdown."""

    def __init__(self, reserved_tool_names: Optional[set] = None) -> None:
        self._providers: List[MemoryProvider] = []
        self._has_external = False
        self._tool_to_provider: Dict[str, MemoryProvider] = {}
        self._reserved_tool_names = reserved_tool_names or set()
        self._sync_executor: Optional[ThreadPoolExecutor] = None
        self._sync_executor_lock = threading.Lock()

    def add_provider(self, provider: MemoryProvider) -> bool:
        is_builtin = getattr(provider, "name", "") == "builtin"
        if not is_builtin:
            if self._has_external:
                logger.warning("Rejected memory provider %r — an external provider is already registered.",
                                provider.name)
                return False
            self._has_external = True
        self._providers.append(provider)

        for schema in provider.get_tool_schemas():
            tool_name = schema.get("name", "")
            if not tool_name:
                continue
            if tool_name in self._reserved_tool_names:
                logger.warning("Provider %r tool %r shadows a reserved tool name; ignored.",
                               provider.name, tool_name)
                continue
            if tool_name not in self._tool_to_provider:
                self._tool_to_provider[tool_name] = provider
        return True

    @property
    def providers(self) -> List[MemoryProvider]:
        return list(self._providers)

    def prefetch_all(self, query: str, *, session_id: str = "") -> str:
        if not query or not query.strip():
            return ""
        parts = []
        for provider in self._providers:
            try:
                result = provider.prefetch(query, session_id=session_id)
                if result and result.strip():
                    parts.append(result)
            except Exception as e:
                logger.debug("Provider %r prefetch failed (non-fatal): %s", provider.name, e)
        return "\n\n".join(parts)

    def sync_all(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None:
        """Sync a completed turn to all providers, off the calling thread.

        A blocking provider call must never hold the turn-completion path
        open. Single-worker executor keeps writes ordered (turn N before N+1).
        """
        providers = list(self._providers)
        if not providers or not user_content or not user_content.strip():
            return

        def _run() -> None:
            for provider in providers:
                try:
                    provider.sync_turn(user_content, assistant_content, session_id=session_id)
                except Exception as e:
                    logger.debug("Provider %r sync failed (non-fatal): %s", provider.name, e)

        self._submit_background(_run)

    def _submit_background(self, fn: Callable[[], None]) -> None:
        executor = self._get_sync_executor()
        if executor is None:
            try:
                fn()
            except Exception as e:
                logger.debug("Inline memory background task failed: %s", e)
            return
        try:
            executor.submit(fn)
        except RuntimeError:
            try:
                fn()
            except Exception as e:
                logger.debug("Inline memory background task failed: %s", e)

    def _get_sync_executor(self) -> Optional[ThreadPoolExecutor]:
        if self._sync_executor is not None:
            return self._sync_executor
        with self._sync_executor_lock:
            if self._sync_executor is None:
                try:
                    self._sync_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mem-sync")
                except Exception as e:
                    logger.warning("Failed to create memory sync executor: %s", e)
                    return None
            return self._sync_executor

    def shutdown_all(self, timeout: float = _SYNC_DRAIN_TIMEOUT_S) -> None:
        """Drain in-flight background work with a bounded timeout, never
        blocking process teardown indefinitely. A wedged provider call past
        the timeout is abandoned — the worker thread is not forcibly killed
        (Python has no safe API for that), but the caller is freed to exit."""
        executor = self._sync_executor
        if executor is None:
            return
        drained = threading.Event()

        def _drain() -> None:
            executor.shutdown(wait=True)
            drained.set()

        threading.Thread(target=_drain, daemon=True).start()
        if not drained.wait(timeout=timeout):
            logger.warning("Memory provider shutdown exceeded %.1fs — abandoning drain.", timeout)

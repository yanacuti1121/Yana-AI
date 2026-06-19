"""Memory provider orchestration.

Origin:  NousResearch/hermes-agent @ 5378b941209d8f62a65455041658ce8ce8144cc9
         agent/memory_manager.py (MIT License)
Ported:  2026-06-19.

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

Lifecycle hooks (on_turn_start, on_session_end/switch, on_pre_compress,
on_memory_write, on_delegation) and tool-call dispatch (get_all_tool_schemas,
handle_tool_call, flush_pending) are mixed in from
`memory_manager_lifecycle.MemoryManagerLifecycleMixin` — split into its own
file to keep this one under the 300-line hard limit. `StreamingContextScrubber`
and `sanitize_context`/`build_memory_context_block` live in
`context_scrubber.py` for the same reason.
License: MIT (see vendor/hermes-agent/_upstream/LICENSE)
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, List, Optional, Protocol

from core.lib.hermes_adapted.memory_manager_lifecycle import MemoryManagerLifecycleMixin

logger = logging.getLogger(__name__)

_SYNC_DRAIN_TIMEOUT_S = 5.0


class MemoryProvider(Protocol):
    name: str

    def prefetch(self, query: str, *, session_id: str = "") -> str: ...
    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None: ...
    def get_tool_schemas(self) -> List[Dict[str, Any]]: ...
    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs: Any) -> str: ...
    def on_turn_start(self, turn_number: int, message: str, **kwargs: Any) -> None: ...
    def on_session_end(self, messages: List[Dict[str, Any]]) -> None: ...
    def on_session_switch(self, new_session_id: str, **kwargs: Any) -> None: ...
    def on_pre_compress(self, messages: List[Dict[str, Any]]) -> str: ...
    def on_memory_write(self, action: str, target: str, content: str, **kwargs: Any) -> None: ...
    def on_delegation(self, task: str, result: str, **kwargs: Any) -> None: ...


class MemoryManager(MemoryManagerLifecycleMixin):
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

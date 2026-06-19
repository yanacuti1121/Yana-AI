"""Memory provider lifecycle hooks + tool-call dispatch — split from
memory_manager.py to stay under the 300-line hard limit.

Origin:  NousResearch/hermes-agent @ 5378b941209d8f62a65455041658ce8ce8144cc9
         agent/memory_manager.py — `get_all_tool_schemas`, `handle_tool_call`,
         `on_turn_start`, `on_session_end`, `on_session_switch`,
         `on_pre_compress`, `on_memory_write`, `on_delegation`, `flush_pending`
         (MIT License)
Ported:  2026-06-19. Mixed into `MemoryManager` (see memory_manager.py) so
         every provider gets notified of turn/session/compression/delegation
         boundaries without the caller needing to know which providers care.
         Failures in one provider are logged and swallowed — a broken
         provider must never break the turn for every other provider or for
         the agent itself.
License: MIT (see vendor/hermes-agent/_upstream/LICENSE)
"""
from __future__ import annotations

import inspect
import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _tool_error(message: str) -> str:
    return json.dumps({"error": message}, ensure_ascii=False)


class MemoryManagerLifecycleMixin:
    """Requires `self._providers` and `self._tool_to_provider` from MemoryManager."""

    # -- Tool-call dispatch ---------------------------------------------

    def get_all_tool_schemas(self) -> List[Dict[str, Any]]:
        """Collect tool schemas from all providers, deduped by name.

        Schemas matching a reserved tool name are skipped — they were
        already rejected from the routing table in `add_provider`, so the
        manager must not advertise a schema it will never route to.
        """
        schemas: List[Dict[str, Any]] = []
        seen: set = set()
        for provider in self._providers:
            try:
                for schema in provider.get_tool_schemas():
                    name = schema.get("name", "")
                    if name in self._reserved_tool_names:
                        continue
                    if name and name not in seen:
                        schemas.append(schema)
                        seen.add(name)
            except Exception as e:
                logger.warning("Provider %r get_tool_schemas() failed: %s", provider.name, e)
        return schemas

    def get_all_tool_names(self) -> set:
        return set(self._tool_to_provider.keys())

    def has_tool(self, tool_name: str) -> bool:
        return tool_name in self._tool_to_provider

    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs: Any) -> str:
        """Route a tool call to the provider that registered it."""
        provider = self._tool_to_provider.get(tool_name)
        if provider is None:
            return _tool_error(f"No memory provider handles tool '{tool_name}'")
        try:
            return provider.handle_tool_call(tool_name, args, **kwargs)
        except Exception as e:
            logger.error("Provider %r handle_tool_call(%s) failed: %s", provider.name, tool_name, e)
            return _tool_error(f"Memory tool '{tool_name}' failed: {e}")

    # -- Lifecycle hooks ---------------------------------------------------

    def on_turn_start(self, turn_number: int, message: str, **kwargs: Any) -> None:
        for provider in self._providers:
            try:
                provider.on_turn_start(turn_number, message, **kwargs)
            except Exception as e:
                logger.debug("Provider %r on_turn_start failed: %s", provider.name, e)

    def on_session_end(self, messages: List[Dict[str, Any]]) -> None:
        for provider in self._providers:
            try:
                provider.on_session_end(messages)
            except Exception as e:
                logger.debug("Provider %r on_session_end failed: %s", provider.name, e)

    def on_session_switch(self, new_session_id: str, *, parent_session_id: str = "",
                           reset: bool = False, rewound: bool = False, **kwargs: Any) -> None:
        """Notify providers that the session_id rotated (/resume, /new, /branch,
        context compression). `rewound=True` means same session_id but the
        transcript was truncated — providers caching per-turn state should
        invalidate it."""
        if not new_session_id:
            return
        if rewound:
            kwargs["rewound"] = True
        for provider in self._providers:
            try:
                provider.on_session_switch(new_session_id, parent_session_id=parent_session_id,
                                            reset=reset, **kwargs)
            except Exception as e:
                logger.debug("Provider %r on_session_switch failed: %s", provider.name, e)

    def on_pre_compress(self, messages: List[Dict[str, Any]]) -> str:
        """Collect provider context to fold into the compression summary prompt."""
        parts = []
        for provider in self._providers:
            try:
                result = provider.on_pre_compress(messages)
                if result and result.strip():
                    parts.append(result)
            except Exception as e:
                logger.debug("Provider %r on_pre_compress failed: %s", provider.name, e)
        return "\n\n".join(parts)

    @staticmethod
    def _memory_write_metadata_mode(provider: Any) -> str:
        """Detect how a provider's on_memory_write accepts `metadata` —
        keyword, positional, or not at all (legacy 3-arg signature)."""
        try:
            params = list(inspect.signature(provider.on_memory_write).parameters.values())
        except (TypeError, ValueError):
            return "keyword"
        if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params):
            return "keyword"
        if any(p.name == "metadata" for p in params):
            return "keyword"
        positional = [p for p in params if p.kind in (
            inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD,
            inspect.Parameter.KEYWORD_ONLY,
        )]
        return "positional" if len(positional) >= 4 else "legacy"

    def on_memory_write(self, action: str, target: str, content: str,
                         metadata: Optional[Dict[str, Any]] = None) -> None:
        """Notify external providers when the built-in memory tool writes.
        Skips the builtin provider itself (it's the source of the write)."""
        for provider in self._providers:
            if provider.name == "builtin":
                continue
            try:
                mode = self._memory_write_metadata_mode(provider)
                if mode == "keyword":
                    provider.on_memory_write(action, target, content, metadata=dict(metadata or {}))
                elif mode == "positional":
                    provider.on_memory_write(action, target, content, dict(metadata or {}))
                else:
                    provider.on_memory_write(action, target, content)
            except Exception as e:
                logger.debug("Provider %r on_memory_write failed: %s", provider.name, e)

    def on_delegation(self, task: str, result: str, *, child_session_id: str = "", **kwargs: Any) -> None:
        for provider in self._providers:
            try:
                provider.on_delegation(task, result, child_session_id=child_session_id, **kwargs)
            except Exception as e:
                logger.debug("Provider %r on_delegation failed: %s", provider.name, e)

    def flush_pending(self, timeout: Optional[float] = None) -> bool:
        """Block until queued background sync/prefetch work has drained.

        Single-worker executor means submitting a no-op and waiting on it
        guarantees every previously-submitted task already ran.
        """
        executor = self._sync_executor
        if executor is None:
            return True
        try:
            future = executor.submit(lambda: None)
        except RuntimeError:
            return True  # already shut down — nothing pending
        try:
            future.result(timeout=timeout)
            return True
        except Exception:
            return False

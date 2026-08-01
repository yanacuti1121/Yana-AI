# Upstream drift — NousResearch/hermes-agent

**Pinned at:** `5378b941209d8f62a65455041658ce8ce8144cc9` (2026-06-19)
**Checked against:** `main` @ 2026-07-16 (**3,601 commits ahead** of our pin — this repo moves fast)
**Method:** fetched each file's current `main` content directly and diffed against our vendored
snapshot in `_upstream/` (the GitHub compare API's per-file stats were unreliable at this
commit distance — several files it reported as "0 changes" turned out to have hundreds of
diff lines on direct comparison; don't trust that API alone for a gap this large).

This file is a **read-only reference** — it does not change any vendored or ported code.
Re-vendoring any of this is a deliberate decision for whoever owns that integration phase.

## Per-file status

| File | Diff lines | New top-level/method signatures | Notes |
|---|---|---|---|
| `context_compressor.py` | 1,272 (+1149/-123) | 14 new methods + 7 new module functions | **Largest change.** See below — directly relevant to Phase 4 (not yet wired). |
| `conversation_loop.py` | 1,596 | `_sync_failover_system_message(...)` | We only ported 3 standalone pieces from this file (`IterationBudget`, `jittered_backoff`, `classify_api_error`) — check whether upstream changes touch those specifically before assuming this is all irrelevant. |
| `memory_manager.py` | 232 | `commit_session_boundary_async`, `notify_memory_tool_write`, `normalize_tool_schema`, `_memory_tool_result_succeeded` | Relevant to Phase 5 (not yet wired). |
| `retry_utils.py` | 101 | `adaptive_rate_limit_backoff`, `is_zai_coding_overload_error`, `zai_coding_overload_retry_ceiling`, `_error_text` | Zai-provider-specific additions — may not apply to our multi-provider setup. |
| `error_classifier.py` | 290 (+273/-17) | `_extract_upstream_provider_name`, `_is_openrouter_upstream_error` | Provider-specific error detection additions. |
| `system_prompt.py` | 69 | `_tui_embedded_pane_clarifier` | Small addition; Phase 2 (not yet wired) so low urgency either way. |
| `turn_retry_state.py` | 15 | (none — internal logic only) | Minor, no new API surface. |
| `iteration_budget.py` | 0 | — | **Identical to our pin.** |
| `tool_guardrails.py` | 0 | — | **Identical to our pin.** Already wired (Phase 3) — good, nothing to reconcile. |

## `context_compressor.py` — what's new (most actionable, Phase 4 is in progress)

Upstream added a **compression-failure cooldown / circuit-breaker** that doesn't exist in our
ported version at all:

```
bind_session_state(session_db=None, session_id="")   — attach persistent session state
on_session_start(session_id, **kwargs)                — session lifecycle hook
record_completed_compaction(*, used_fallback=False)   — success/fallback bookkeeping
get_active_compression_failure_cooldown()             — read current cooldown state
_record_compression_failure_cooldown(...)             — set cooldown after repeated failures
_clear_compression_failure_cooldown()                 — reset on success
_load_fallback_compression_streak() / _persist_fallback_compression_streak()
                                                       — persists failure streak across restarts
```

Plus configurable threshold math (`_effective_threshold_percent`, `_compute_threshold_tokens`,
`_effective_protect_first_n`, `_coerce_max_tokens`) replacing what was presumably a hardcoded
threshold in the version we ported, and several small helpers (`_find_turn_pair_end`,
`_estimate_msg_budget_tokens`, `_summarize_tool_result_unguarded`, `_image_part_label`,
`_strip_persistence_markers`, `_serialized_length_for_budget`, `_fresh_compaction_message_copy`,
`_str_arg`).

**Why this matters now:** `core/lib/hermes_adapted/context_compressor_io.py` is being actively
built (Phase 4, in progress as of 2026-07-16) with no cooldown/circuit-breaker concept ported
yet. Worth deciding — before that work is called done — whether to port the cooldown mechanism
too, since compression repeatedly failing silently with no backoff is exactly the kind of gap
a circuit-breaker like this exists to close.

## Recommendation

Don't blanket re-vendor everything — 3,601 commits of an actively-developed repo will include
plenty that's irrelevant to what we ported (this diff already shows Zai/OpenRouter
provider-specific code that likely doesn't apply here). Worth a deliberate look at:
1. `context_compressor.py`'s cooldown mechanism — before Phase 4 is called done.
2. `memory_manager.py`'s `commit_session_boundary_async`/`notify_memory_tool_write` — before Phase 5 starts.
3. `conversation_loop.py` — check specifically whether `_sync_failover_system_message` or other
   changes touch the 3 pieces we actually ported, since the file overall is out of scope
   (see `core/lib/hermes_adapted/conversation_loop.py`'s own docstring on why the full loop
   was never ported).

Raw upstream file contents used for this comparison are not committed here (fetched via `gh api`
against `main`, not persisted) — re-run against current `main` before acting on this if much time
has passed, since this repo's pace means it will drift further within days.

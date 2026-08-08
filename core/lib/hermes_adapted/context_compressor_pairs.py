"""Tool-pair safety + tail anchoring for context_compressor.py — split into
its own file to keep context_compressor.py under the 300-line hard limit.

Origin:  NousResearch/hermes-agent @ 5378b941209d8f62a65455041658ce8ce8144cc9
         agent/context_compressor.py — `_sanitize_tool_pairs`,
         `_ensure_last_user_message_in_tail`,
         `_ensure_last_assistant_message_in_tail`,
         `_find_last_user_message_idx`, `_find_last_assistant_message_idx`
         (MIT License)
Ported:  2026-06-19. These were judged "real algorithm, not hermes-specific"
         but cut from the first pass purely for line-budget reasons. Ported
         here near-verbatim as free functions (taking `messages`/`head_end`/
         `cut_idx` instead of reading `self`) so context_compressor.py can
         call them without inheriting more state.
License: MIT (see vendor/hermes-agent/_upstream/LICENSE)

Three real bugs these fix, both from production incident reports in the
original (kept here because they explain *why* this exists, not just *what*
it does):
  - #10896: the token-budget tail cut could leave the user's most recent
    message inside the *compressed* region. The summarizer then buries it
    under a "historical pending asks" heading the next turn is told to
    ignore — the active task silently disappears.
  - #29824: same failure mode for the assistant's last visible reply — the
    user opens the session and sees "[CONTEXT COMPACTION]" where their last
    answer used to be.
  - #79278 (ported 2026-08-08, upstream commits 788b8ab4/03beb662 — see
    vendor/hermes-agent/UPSTREAM_DRIFT.md's 2026-08-08 update): a trailing
    assistant tool_call whose result hasn't landed yet in the transcript
    read by context-compress-stop.sh (Claude Code's own transcript writer
    appends the tool_result after the tool finishes — the same
    request/pending-result timing gap hermes hit with its own executor) was
    being treated as "orphaned" and given a fake stub result. Lower stakes
    here than upstream's original report — our compress() output only ever
    feeds a written-once summary .md, never gets replayed back into a live
    API request the way hermes' does, so this could never cause the
    API-rejection failure upstream's issue is about — but a stub result
    mislabeling a still-pending call as "[Result from earlier
    conversation]" is still a real inaccuracy in that summary. See
    `sanitize_tool_pairs`'s docstring for the mechanism.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List

AlignBackward = Callable[[List[Dict[str, Any]], int], int]


def find_last_user_message_idx(messages: List[Dict[str, Any]], head_end: int) -> int:
    """Index of the last user-role message at or after head_end, or -1."""
    for i in range(len(messages) - 1, head_end - 1, -1):
        if messages[i].get("role") == "user":
            return i
    return -1


def find_last_assistant_message_idx(messages: List[Dict[str, Any]], head_end: int) -> int:
    """Index of the last *content-bearing* assistant reply, or -1.

    Skips tool_calls-only assistant messages (no visible text) — those
    render as a small "calling tool X" indicator, not a reply a user would
    notice missing. Falls back to the most recent assistant message of any
    kind only if no content-bearing one exists.
    """
    last_any = -1
    for i in range(len(messages) - 1, head_end - 1, -1):
        msg = messages[i]
        if msg.get("role") != "assistant":
            continue
        if last_any < 0:
            last_any = i
        content = msg.get("content")
        if isinstance(content, str) and content.strip():
            return i
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    text = part.get("text") or part.get("content")
                    if isinstance(text, str) and text.strip():
                        return i
    return last_any


def ensure_last_user_message_in_tail(messages: List[Dict[str, Any]], cut_idx: int,
                                      head_end: int) -> int:
    """Pull cut_idx back so the most recent user message is never compressed away.

    A user message is already a clean boundary (no tool group to split), so
    no realignment is needed once pulled back.
    """
    last_user_idx = find_last_user_message_idx(messages, head_end)
    if last_user_idx < 0 or last_user_idx >= cut_idx:
        return cut_idx
    return max(last_user_idx, head_end + 1)


def ensure_last_assistant_message_in_tail(messages: List[Dict[str, Any]], cut_idx: int,
                                           head_end: int, align_backward: AlignBackward) -> int:
    """Pull cut_idx back so the most recent visible assistant reply survives.

    Re-runs `align_backward` so we don't split a tool_call/tool_result group
    that immediately precedes the anchored reply (which would orphan the
    tool messages and have them removed by `sanitize_tool_pairs`).
    """
    last_asst_idx = find_last_assistant_message_idx(messages, head_end)
    if last_asst_idx < 0 or last_asst_idx >= cut_idx:
        return cut_idx
    new_cut = align_backward(messages, last_asst_idx)
    return max(new_cut, head_end + 1)


def _tool_call_id(tc: Any) -> str:
    if isinstance(tc, dict):
        return tc.get("call_id", "") or tc.get("id", "") or ""
    return getattr(tc, "call_id", "") or getattr(tc, "id", "") or ""


def _trailing_inflight_assistant(messages: List[Dict[str, Any]]) -> Any:
    """The last non-tool message, if it's an assistant tool_call — presumed
    still pending a result rather than orphaned. See #79278 in this module's
    docstring: a multi-call batch's results land one at a time, so a
    snapshot taken mid-batch can look like `[..., assistant(c1,c2,c3),
    tool(c1)]` — walk back past any trailing tool results first so that
    shape is still recognized as in-flight, not just the single-message-tail
    case."""
    idx = len(messages) - 1
    while idx >= 0 and messages[idx].get("role") == "tool":
        idx -= 1
    if idx >= 0 and messages[idx].get("role") == "assistant":
        return messages[idx]
    return None


def sanitize_tool_pairs(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Fix orphaned tool_call / tool_result pairs left behind by compression.

    Two failure modes, both API-rejection errors in hermes' original (our
    port's compress() output only ever feeds a written summary, never gets
    replayed into a live API request — see #79278 in this module's
    docstring for why the stakes differ here, not why the fix doesn't):
      1. A tool result whose assistant tool_call was summarized away —
         removed.
      2. An assistant tool_call whose result was dropped — a stub result is
         inserted so every tool_call still has a matching result, EXCEPT the
         trailing in-flight call (if any): that one is presumed still
         pending its real result rather than orphaned, and is left alone.
    """
    surviving_call_ids = {
        _tool_call_id(tc)
        for msg in messages if msg.get("role") == "assistant"
        for tc in (msg.get("tool_calls") or [])
        if _tool_call_id(tc)
    }
    result_call_ids = {
        msg.get("tool_call_id") for msg in messages
        if msg.get("role") == "tool" and msg.get("tool_call_id")
    }

    orphaned_results = result_call_ids - surviving_call_ids
    if orphaned_results:
        messages = [m for m in messages
                    if not (m.get("role") == "tool" and m.get("tool_call_id") in orphaned_results)]

    missing_results = surviving_call_ids - result_call_ids
    if not missing_results:
        return messages

    trailing_inflight = _trailing_inflight_assistant(messages)

    patched: List[Dict[str, Any]] = []
    for msg in messages:
        patched.append(msg)
        if msg.get("role") == "assistant" and msg is not trailing_inflight:
            for tc in msg.get("tool_calls") or []:
                cid = _tool_call_id(tc)
                if cid in missing_results:
                    patched.append({
                        "role": "tool",
                        "content": "[Result from earlier conversation — see context summary above]",
                        "tool_call_id": cid,
                    })
    return patched

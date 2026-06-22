"""Pure message-shaping helpers extracted from user-turn transcript handling.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/sessions/user-turn-transcript.ts (MIT)
Ported:  2026-06-22. PARTIAL port by design (confirmed with the sovereign):
         only the pure, I/O-free message-shaping helpers are ported --
         `resolvePersistedUserTurnText`, `buildPersistedUserTurnMediaInputsFromFields`
         (+ its private helpers), `buildPersistedUserTurnMessage`,
         `mergePreparedUserTurnMessageForRuntime`, and
         `preparePersistedUserTurnMessageForTranscriptWrite`. NOT ported:
         `appendUserTurnTranscriptMessage`, `persistUserTurnTranscript`,
         `appendFileTargetUserTurnTranscript`, and
         `createUserTurnTranscriptRecorder` -- these orchestrate real file
         I/O through `persistSessionTranscriptTurn` (an unported, heavy
         session-store module), the same "out of scope" category as
         session-chat-type.ts/send-policy.ts in the earlier batch.

         `mimeTypeFromFilePath` (from the external `@openclaw/media-core/mime`
         package, not vendored here) is substituted with Python's stdlib
         `mimetypes.guess_type` -- verified to return the same MIME type for
         every case the upstream test suite actually exercises (.png, .pdf,
         .bin, and the "media://" pseudo-scheme, which it handles by
         extension only, ignoring the scheme).
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

import mimetypes
import os
import re
import time
from dataclasses import dataclass
from typing import Callable, Mapping, Sequence

from core.lib.openclaw_adapted.input_provenance import (
    InputProvenance,
    apply_input_provenance_to_user_message,
    normalize_input_provenance,
)
from core.lib.openclaw_adapted.string_coerce import normalize_optional_string

_CHANNEL_MEDIA_PLACEHOLDER_PATTERN = re.compile(
    r"^<media:[a-z0-9_-]+>(?:\s+\([^)]*\))?$", re.IGNORECASE
)
_URL_LIKE_MEDIA_PATH_PATTERN = re.compile(r"^[a-z][a-z0-9+.\-]*:", re.IGNORECASE)


# Select text for persisted user turns. Channel-generated media placeholders
# are dropped only when structured media is present, keeping plain text intact.
def resolve_persisted_user_turn_text(value: str | None, *, has_media: bool = False) -> str | None:
    normalized = normalize_optional_string(value)
    if not normalized:
        return None
    if has_media and _CHANNEL_MEDIA_PLACEHOLDER_PATTERN.match(normalized):
        return None
    return normalized


def _media_type_for_transcript(media: Mapping[str, object]) -> str:
    return (
        normalize_optional_string(media.get("contentType"))
        or normalize_optional_string(media.get("kind"))
        or "application/octet-stream"
    )


def _normalize_media_entry_for_transcript(media: Mapping[str, object]) -> tuple[str, str] | None:
    path_local = normalize_optional_string(media.get("path")) or normalize_optional_string(
        media.get("url")
    )
    if not path_local:
        return None
    return path_local, _media_type_for_transcript(media)


def _build_persisted_user_turn_media_fields(
    media: Sequence[Mapping[str, object]] | None,
) -> dict[str, object]:
    entries = media if media is not None else []
    normalized = [
        n for n in (_normalize_media_entry_for_transcript(m) for m in entries) if n is not None
    ]
    if not normalized:
        return {}
    paths = [p for p, _t in normalized]
    types = [t for _p, t in normalized]
    return {"MediaPath": paths[0], "MediaPaths": paths, "MediaType": types[0], "MediaTypes": types}


def _normalize_optional_text_array(values: Sequence[object] | None) -> list[str | None]:
    if values is None:
        return []
    return [normalize_optional_string(v) for v in values]


def _resolve_transcript_media_path(path_value: str, workspace_dir: str | None) -> str:
    # Relative staged media paths are anchored to the media workspace; absolute
    # paths and URL-like refs are already stable transcript references.
    if (
        not workspace_dir
        or os.path.isabs(path_value)
        or _URL_LIKE_MEDIA_PATH_PATTERN.match(path_value)
    ):
        return path_value
    return os.path.join(workspace_dir, path_value)


def _resolve_transcript_media_type(
    *, explicit_type: str | None, media_path: str | None, media_url: str | None
) -> str | None:
    if explicit_type:
        return explicit_type
    guessed, _encoding = mimetypes.guess_type(media_path or media_url or "")
    return guessed


def build_persisted_user_turn_media_inputs_from_fields(
    fields: Mapping[str, object] | None,
) -> list[dict[str, object]]:
    if fields is None:
        return []

    paths = _normalize_optional_text_array(fields.get("MediaPaths"))
    urls = _normalize_optional_text_array(fields.get("MediaUrls"))
    types = _normalize_optional_text_array(fields.get("MediaTypes"))
    single_path = normalize_optional_string(fields.get("MediaPath"))
    single_url = normalize_optional_string(fields.get("MediaUrl"))
    single_type = normalize_optional_string(fields.get("MediaType"))
    workspace_dir = normalize_optional_string(fields.get("MediaWorkspaceDir"))
    media_count = max(len(paths), len(urls), 1 if (single_path or single_url) else 0)

    media: list[dict[str, object]] = []
    for index in range(media_count):
        raw_path = (paths[index] if index < len(paths) else None) or (
            single_path if index == 0 else None
        )
        media_path = _resolve_transcript_media_path(raw_path, workspace_dir) if raw_path else None
        url = (urls[index] if index < len(urls) else None) or (single_url if index == 0 else None)
        if not media_path and not url:
            continue
        entry: dict[str, object] = {}
        if media_path:
            entry["path"] = media_path
        if url:
            entry["url"] = url
        entry["contentType"] = _resolve_transcript_media_type(
            explicit_type=(types[index] if index < len(types) else None)
            or (single_type if index == 0 else None),
            media_path=media_path,
            media_url=url,
        )
        media.append(entry)
    return media


@dataclass(frozen=True)
class UserTurnInput:
    text: str | None = None
    media: tuple[Mapping[str, object], ...] | None = None
    timestamp: int | None = None
    idempotency_key: str | None = None
    provenance: InputProvenance | None = None
    media_only_text: str | None = None


def build_persisted_user_turn_message(params: UserTurnInput) -> Mapping[str, object]:
    media_fields = _build_persisted_user_turn_media_fields(params.media)
    has_media = bool(media_fields.get("MediaPath"))
    text = params.text if params.text is not None else ""
    # Storage is BARE (no timestamp prefix). The per-message timestamp is added
    # at the single LLM-boundary stamping site elsewhere, derived from each
    # message's own `timestamp` field, so the current turn and every
    # historical turn serialize identically on the wire.
    content = text or (params.media_only_text or "" if has_media else "")

    message: dict[str, object] = {
        "role": "user",
        "content": content,
        "timestamp": params.timestamp if params.timestamp is not None else int(time.time() * 1000),
    }
    if params.idempotency_key:
        message["idempotencyKey"] = params.idempotency_key
    message.update(media_fields)
    return apply_input_provenance_to_user_message(message, params.provenance)


def _resolve_persisted_user_turn_message(
    *, input: UserTurnInput | None = None, message: Mapping[str, object] | None = None
) -> Mapping[str, object] | None:
    if message is not None:
        return message
    if input is None:
        return None
    return build_persisted_user_turn_message(input)


def _is_user_message(message: Mapping[str, object]) -> bool:
    return message.get("role") == "user"


def _is_before_agent_run_blocked_message(message: Mapping[str, object]) -> bool:
    marker = message.get("__openclaw")
    return isinstance(marker, Mapping) and "beforeAgentRunBlocked" in marker


# Runtime messages may lack transcript metadata because channel adapters prepare
# display text separately. Merge only safe user messages, never block markers.
def merge_prepared_user_turn_message_for_runtime(
    *, runtime_message: Mapping[str, object], prepared_message: Mapping[str, object] | None = None
) -> Mapping[str, object]:
    if (
        prepared_message is None
        or not _is_user_message(runtime_message)
        or _is_before_agent_run_blocked_message(runtime_message)
    ):
        return runtime_message
    return {**runtime_message, **prepared_message}


BeforeMessageWrite = Callable[[Mapping[str, object]], "Mapping[str, object] | None"]


def prepare_persisted_user_turn_message_for_transcript_write(
    message: Mapping[str, object],
    *,
    agent_id: str | None = None,
    session_key: str | None = None,
    before_message_write: BeforeMessageWrite | None = None,
) -> Mapping[str, object] | None:
    """Apply a before-message hook while preserving user-turn transcript metadata."""
    if before_message_write is None:
        return message
    original_idempotency_key = message.get("idempotencyKey")
    idempotency_key = (
        original_idempotency_key if isinstance(original_idempotency_key, str) else None
    )
    provenance = normalize_input_provenance(message.get("provenance"))
    hook_params: dict[str, object] = {"message": message}
    if agent_id:
        hook_params["agentId"] = agent_id
    if session_key:
        hook_params["sessionKey"] = session_key
    next_message = before_message_write(hook_params)
    if next_message is None or next_message.get("role") != "user":
        return None
    next_user_message = (
        apply_input_provenance_to_user_message(next_message, provenance)
        if provenance is not None
        else next_message
    )
    if idempotency_key:
        return {**next_user_message, "idempotencyKey": idempotency_key}
    return next_user_message

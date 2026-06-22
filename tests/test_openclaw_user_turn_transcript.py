"""Tests for the openclaw_adapted user-turn-transcript port (pure subset only).

Origin: core/lib/openclaw_adapted/user_turn_transcript.py (ported from
openclaw/openclaw, MIT). Translated directly from the 3 portable describe
blocks in upstream src/sessions/user-turn-transcript.test.ts (pinned commit
e2c567538d8964ab594f63ea3121ee72149f273d): "buildPersistedUserTurnMediaInputsFromFields",
"mergePreparedUserTurnMessageForRuntime", "resolvePersistedUserTurnText".
The "appendUserTurnTranscriptMessage"/"persistUserTurnTranscript"/
"createUserTurnTranscriptRecorder" describes are NOT translated -- they test
the I/O-bound functions this port intentionally excludes (see module
docstring). The upstream "mergePreparedUserTurnMessageForRuntime" tests build
`preparedMessage` via `createUserTurnTranscriptRecorder(...).message`; since
that recorder isn't ported, the tests below call
`build_persisted_user_turn_message` directly instead -- for a static `input`
with no `resolveInput`, `recorder.message` is exactly
`buildPersistedUserTurnMessage(input)` (traced in the upstream source), so
this substitution is behaviorally equivalent, not a weakened test.
"""
import os

from core.lib.openclaw_adapted.user_turn_transcript import (
    UserTurnInput,
    build_persisted_user_turn_media_inputs_from_fields,
    build_persisted_user_turn_message,
    merge_prepared_user_turn_message_for_runtime,
    resolve_persisted_user_turn_text,
)


# -- build_persisted_user_turn_media_inputs_from_fields --


def test_builds_media_inputs_from_structured_context_media_fields():
    result = build_persisted_user_turn_media_inputs_from_fields(
        {
            "MediaPath": "/tmp/a.png",
            "MediaPaths": ["/tmp/a.png", "/tmp/b.jpg"],
            "MediaType": "image/png",
            "MediaTypes": ["image/png", "image/jpeg"],
        }
    )
    assert result == [
        {"path": "/tmp/a.png", "contentType": "image/png"},
        {"path": "/tmp/b.jpg", "contentType": "image/jpeg"},
    ]


def test_uses_url_backed_media_fields_when_no_local_path_present():
    result = build_persisted_user_turn_media_inputs_from_fields(
        {"MediaUrl": "media://inbound/a.png", "MediaType": "image/png"}
    )
    assert result == [{"url": "media://inbound/a.png", "contentType": "image/png"}]


def test_infers_transcript_media_type_from_media_path_when_explicit_type_absent():
    result = build_persisted_user_turn_media_inputs_from_fields(
        {"MediaPaths": ["/tmp/a.png", "https://example.test/report.pdf"]}
    )
    assert result == [
        {"path": "/tmp/a.png", "contentType": "image/png"},
        {"path": "https://example.test/report.pdf", "contentType": "application/pdf"},
    ]


def test_does_not_reuse_singular_media_type_for_later_media_paths():
    result = build_persisted_user_turn_media_inputs_from_fields(
        {
            "MediaPath": "/tmp/a.png",
            "MediaPaths": ["/tmp/a.png", "/tmp/report.pdf"],
            "MediaType": "image/png",
        }
    )
    assert result == [
        {"path": "/tmp/a.png", "contentType": "image/png"},
        {"path": "/tmp/report.pdf", "contentType": "application/pdf"},
    ]


def test_resolves_staged_relative_media_paths_against_media_workspace(tmp_path):
    workspace_dir = str(tmp_path)
    result = build_persisted_user_turn_media_inputs_from_fields(
        {
            "MediaPath": "media/inbound/a.png",
            "MediaPaths": ["media/inbound/a.png", "media/inbound/b.jpg"],
            "MediaType": "image/png",
            "MediaTypes": ["image/png", "image/jpeg"],
            "MediaWorkspaceDir": workspace_dir,
        }
    )
    assert result == [
        {"path": os.path.join(workspace_dir, "media/inbound/a.png"), "contentType": "image/png"},
        {"path": os.path.join(workspace_dir, "media/inbound/b.jpg"), "contentType": "image/jpeg"},
    ]


def test_does_not_rewrite_absolute_or_url_like_media_paths(tmp_path):
    workspace_dir = str(tmp_path)
    absolute_path = os.path.join(workspace_dir, "media/inbound/a.png")
    result = build_persisted_user_turn_media_inputs_from_fields(
        {
            "MediaPaths": [absolute_path, "media://inbound/b.jpg", "https://example.test/c.png"],
            "MediaTypes": ["image/png", "image/jpeg", "image/png"],
            "MediaWorkspaceDir": workspace_dir,
        }
    )
    assert result == [
        {"path": absolute_path, "contentType": "image/png"},
        {"path": "media://inbound/b.jpg", "contentType": "image/jpeg"},
        {"path": "https://example.test/c.png", "contentType": "image/png"},
    ]


def test_does_not_infer_media_from_absent_structured_fields():
    assert build_persisted_user_turn_media_inputs_from_fields(None) == []
    assert build_persisted_user_turn_media_inputs_from_fields({}) == []


def test_preserves_index_alignment_when_earlier_attachment_lacks_content_type():
    # Writer pads missing types with "" to keep MediaPaths/MediaTypes index-aligned.
    # The reader must NOT compact those "" holes away before indexing or a later
    # attachment's type lands on the wrong attachment.
    result = build_persisted_user_turn_media_inputs_from_fields(
        {"MediaPaths": ["/media/a.bin", "/media/b.png"], "MediaTypes": ["", "image/png"]}
    )
    assert len(result) == 2
    first, second = result
    assert first["path"] == "/media/a.bin"
    assert first["contentType"] != "image/png"
    assert second == {"path": "/media/b.png", "contentType": "image/png"}


def test_preserves_index_alignment_when_earlier_attachment_lacks_url():
    result = build_persisted_user_turn_media_inputs_from_fields(
        {
            "MediaPaths": ["/media/local.bin", ""],
            "MediaUrls": ["", "https://example.test/remote.png"],
            "MediaTypes": ["application/octet-stream", "image/png"],
        }
    )
    assert result == [
        {"path": "/media/local.bin", "contentType": "application/octet-stream"},
        {"url": "https://example.test/remote.png", "contentType": "image/png"},
    ]


# -- merge_prepared_user_turn_message_for_runtime --


def test_adds_prepared_transcript_metadata_to_runtime_user_messages():
    prepared = build_persisted_user_turn_message(
        UserTurnInput(
            text="display prompt",
            media=({"path": "/tmp/image.png", "contentType": "image/png"},),
            timestamp=123,
        )
    )
    runtime_message = {
        "role": "user",
        "content": "runtime prompt",
        "provenance": {"sourceChannel": "telegram"},
    }

    result = merge_prepared_user_turn_message_for_runtime(
        runtime_message=runtime_message, prepared_message=prepared
    )

    assert result["role"] == "user"
    assert result["content"] == "display prompt"
    assert result["provenance"] == {"sourceChannel": "telegram"}
    assert result["timestamp"] == 123
    assert result["MediaPath"] == "/tmp/image.png"
    assert result["MediaType"] == "image/png"


def test_does_not_replace_blocked_before_agent_run_user_markers():
    prepared = build_persisted_user_turn_message(UserTurnInput(text="raw prompt"))
    blocked = {
        "role": "user",
        "content": "[blocked]",
        "__openclaw": {"beforeAgentRunBlocked": True},
    }

    result = merge_prepared_user_turn_message_for_runtime(
        runtime_message=blocked, prepared_message=prepared
    )

    assert result is blocked


def test_does_not_apply_prepared_user_metadata_to_assistant_messages():
    prepared = build_persisted_user_turn_message(UserTurnInput(text="display prompt"))
    assistant = {"role": "assistant", "content": "hello"}

    result = merge_prepared_user_turn_message_for_runtime(
        runtime_message=assistant, prepared_message=prepared
    )

    assert result is assistant


# -- resolve_persisted_user_turn_text --


def test_normalizes_selected_clean_user_turn_transcript_text():
    assert (
        resolve_persisted_user_turn_text("  What is in this image?  ", has_media=True)
        == "What is in this image?"
    )


def test_ignores_exact_channel_media_placeholders_only_when_structured_media_present():
    assert resolve_persisted_user_turn_text("<media:image> (2 images)", has_media=True) is None
    assert (
        resolve_persisted_user_turn_text("<media:image> (2 images)", has_media=False)
        == "<media:image> (2 images)"
    )

"""Tests for the openclaw_adapted session-key-utils port.

Origin: core/lib/openclaw_adapted/session_key_utils.py (ported from openclaw/openclaw, MIT)

The case-preservation test matrix below is translated from the upstream
src/sessions/session-key-case-preservation.test.ts (pinned commit
e2c567538d8964ab594f63ea3121ee72149f273d). Only the cases that exercise
session-key-utils.ts itself are ported; that file's `resolveSessionStoreEntry`
suite belongs to a different module (../config/sessions/store-entry.js) that
is out of scope for this port.
"""
from core.lib.openclaw_adapted.session_key_case_preservation import (
    is_case_preserving_peer,
    normalize_session_key_preserving_opaque_peer_ids,
    normalize_session_peer_id,
    parse_raw_session_conversation_ref,
    requires_folded_session_key_alias_proof,
)
from core.lib.openclaw_adapted.session_key_utils import (
    get_subagent_depth,
    is_acp_session_key,
    is_cron_run_session_key,
    is_cron_session_key,
    is_subagent_session_key,
    parse_agent_session_key,
    parse_thread_session_suffix,
)

ROOM_A = "!MixedRoomAbCdEf:example.org"
ROOM_B = "!OtherRoomGhIjKl:matrix.example.org"
EVENT = "$EvMixedCaseAbCdEfGhIjKlMnOpQrStUvWxYz0"


# -- is_case_preserving_peer --


def test_enrolls_matrix_and_signal_not_others():
    assert is_case_preserving_peer("matrix", "channel") is True
    assert is_case_preserving_peer("matrix", "group") is True
    assert is_case_preserving_peer("matrix", "direct") is False
    assert is_case_preserving_peer("signal", "group") is True
    assert is_case_preserving_peer("signal", "direct") is False
    assert is_case_preserving_peer("telegram", "group") is False
    assert is_case_preserving_peer("slack", "channel") is False


def test_is_case_insensitive_on_channel_and_peer_kind_labels():
    assert is_case_preserving_peer("Matrix", "Channel") is True


# -- requires_folded_session_key_alias_proof --


def test_requires_alias_proof_only_for_tail_preserved_matrix_room_keys():
    assert requires_folded_session_key_alias_proof(f"agent:main:matrix:channel:{ROOM_A}") is True
    assert requires_folded_session_key_alias_proof("agent:ops:signal:group:AbC123=") is False
    assert requires_folded_session_key_alias_proof("agent:main:telegram:group:MixedHandle") is False


# -- normalize_session_peer_id --


def test_preserves_matrix_room_ids_for_channel_group_peers():
    assert normalize_session_peer_id(channel="matrix", peer_kind="channel", peer_id=ROOM_A) == ROOM_A
    assert normalize_session_peer_id(channel="matrix", peer_kind="group", peer_id=ROOM_B) == ROOM_B


def test_lowercases_non_enrolled_channels_and_matrix_direct_peers():
    assert (
        normalize_session_peer_id(channel="telegram", peer_kind="group", peer_id="MixedHandle")
        == "mixedhandle"
    )
    assert normalize_session_peer_id(channel="matrix", peer_kind="direct", peer_id="@Bob:X") == "@bob:x"


def test_still_preserves_signal_group_ids():
    assert normalize_session_peer_id(channel="signal", peer_kind="group", peer_id="AbC123=") == "AbC123="


def test_peer_id_empty_or_none_returns_empty_string():
    assert normalize_session_peer_id(channel="matrix", peer_kind="channel", peer_id="") == ""
    assert normalize_session_peer_id(channel="matrix", peer_kind="channel", peer_id=None) == ""
    assert normalize_session_peer_id(channel="matrix", peer_kind="channel", peer_id="   ") == ""


# -- normalize_session_key_preserving_opaque_peer_ids --


def test_preserves_matrix_room_id_embedded_server_in_channel_key():
    key = f"agent:main:matrix:channel:{ROOM_A}"
    assert normalize_session_key_preserving_opaque_peer_ids(key) == key


def test_preserves_matrix_room_id_and_thread_suffix():
    key = f"agent:main:matrix:channel:{ROOM_A}:thread:{EVENT}"
    assert normalize_session_key_preserving_opaque_peer_ids(key) == key


def test_lowercases_matrix_thread_marker_while_preserving_room_and_event_ids():
    assert normalize_session_key_preserving_opaque_peer_ids(
        f"agent:main:matrix:channel:{ROOM_A}:Thread:{EVENT}"
    ) == f"agent:main:matrix:channel:{ROOM_A}:thread:{EVENT}"


def test_lowercases_structural_head_but_keeps_opaque_tail():
    assert normalize_session_key_preserving_opaque_peer_ids(
        f"Agent:Main:Matrix:Channel:{ROOM_A}"
    ) == f"agent:main:matrix:channel:{ROOM_A}"


def test_preserves_unscoped_matrix_room_and_thread_ids_before_agent_scoping():
    assert normalize_session_key_preserving_opaque_peer_ids(
        f"Matrix:Channel:{ROOM_A}"
    ) == f"matrix:channel:{ROOM_A}"
    assert normalize_session_key_preserving_opaque_peer_ids(
        f"Matrix:Channel:{ROOM_A}:Thread:{EVENT}"
    ) == f"matrix:channel:{ROOM_A}:thread:{EVENT}"


def test_lowercases_matrix_dm_direct_keys_out_of_scope_by_decision():
    assert (
        normalize_session_key_preserving_opaque_peer_ids("agent:main:matrix:direct:@Bob:Example.Org")
        == "agent:main:matrix:direct:@bob:example.org"
    )


def test_preserves_signal_group_id_segment_scoped_and_unscoped():
    assert (
        normalize_session_key_preserving_opaque_peer_ids("agent:ops:signal:group:AbC123=")
        == "agent:ops:signal:group:AbC123="
    )
    assert (
        normalize_session_key_preserving_opaque_peer_ids("Signal:Group:AbC123=")
        == "signal:group:AbC123="
    )


def test_keeps_lowercasing_signal_thread_suffix_segment_span_not_tail():
    assert (
        normalize_session_key_preserving_opaque_peer_ids("agent:ops:signal:group:AbC123=:thread:XyZ")
        == "agent:ops:signal:group:AbC123=:thread:xyz"
    )


def test_trims_whitespace_inside_preserved_signal_segment():
    assert (
        normalize_session_key_preserving_opaque_peer_ids("agent:ops:signal:group: AbC123= ")
        == "agent:ops:signal:group:AbC123="
    )


def test_does_not_preserve_non_enrolled_channels_even_with_thread_shaped_peer_id():
    assert (
        normalize_session_key_preserving_opaque_peer_ids(
            "agent:main:qa:channel:thread:QA-Room/Thread-1"
        )
        == "agent:main:qa:channel:thread:qa-room/thread-1"
    )
    assert (
        normalize_session_key_preserving_opaque_peer_ids("agent:main:slack:channel:C1:thread:ABC")
        == "agent:main:slack:channel:c1:thread:abc"
    )


def test_known_residual_lowercases_main_base_thread_event_no_channel_boundary():
    key = f"agent:main:main:thread:{EVENT}"
    assert normalize_session_key_preserving_opaque_peer_ids(key) == key.lower()


def test_empty_and_none_session_key_returns_empty_string():
    assert normalize_session_key_preserving_opaque_peer_ids("") == ""
    assert normalize_session_key_preserving_opaque_peer_ids(None) == ""
    assert normalize_session_key_preserving_opaque_peer_ids("   ") == ""


def test_max_length_session_key_does_not_crash():
    huge_key = "agent:main:slack:channel:" + ("a" * 65536)
    result = normalize_session_key_preserving_opaque_peer_ids(huge_key)
    assert result == huge_key.lower()


def test_null_byte_and_path_traversal_in_session_key_preserved_lowercased():
    value = "agent:main:slack:channel:" + chr(0) + "../../etc/passwd"
    assert normalize_session_key_preserving_opaque_peer_ids(value) == value.lower()


# -- parse_agent_session_key --


def test_parse_agent_session_key_basic():
    parsed = parse_agent_session_key("agent:main:telegram:group:abc")
    assert parsed is not None
    assert parsed.agent_id == "main"
    assert parsed.rest == "telegram:group:abc"


def test_parse_agent_session_key_rejects_non_agent_or_too_short():
    assert parse_agent_session_key("notagent:main:telegram:group") is None
    assert parse_agent_session_key("agent:main") is None
    assert parse_agent_session_key(None) is None
    assert parse_agent_session_key("") is None


# -- cron / subagent / acp classifiers --


def test_is_cron_run_session_key():
    assert is_cron_run_session_key("agent:main:cron:job1:run:42") is True
    assert is_cron_run_session_key("agent:main:cron:job1:run:42:extra") is True
    assert is_cron_run_session_key("agent:main:cron:job1") is False
    assert is_cron_run_session_key("agent:main:telegram:group:abc") is False


def test_is_cron_session_key():
    assert is_cron_session_key("agent:main:cron:job1") is True
    assert is_cron_session_key("agent:main:telegram:group:abc") is False
    assert is_cron_session_key(None) is False


def test_is_subagent_session_key():
    assert is_subagent_session_key("subagent:parent:1") is True
    assert is_subagent_session_key("agent:main:subagent:task1") is True
    assert is_subagent_session_key("agent:main:telegram:group:abc") is False
    assert is_subagent_session_key(None) is False


def test_get_subagent_depth():
    assert get_subagent_depth(None) == 0
    assert get_subagent_depth("agent:main:telegram:group:abc") == 0
    assert get_subagent_depth("agent:main:subagent:task1") == 1
    assert get_subagent_depth("agent:main:subagent:task1:subagent:task2") == 2


def test_is_acp_session_key():
    assert is_acp_session_key("acp:client1") is True
    assert is_acp_session_key("agent:main:acp:client1") is True
    assert is_acp_session_key("agent:main:telegram:group:abc") is False
    assert is_acp_session_key(None) is False


# -- parse_thread_session_suffix --


def test_parse_thread_session_suffix_with_thread():
    result = parse_thread_session_suffix(f"agent:main:matrix:channel:{ROOM_A}:thread:{EVENT}")
    assert result.base_session_key == f"agent:main:matrix:channel:{ROOM_A}"
    assert result.thread_id == EVENT


def test_parse_thread_session_suffix_without_thread():
    result = parse_thread_session_suffix("agent:main:telegram:group:abc")
    assert result.base_session_key == "agent:main:telegram:group:abc"
    assert result.thread_id is None


def test_parse_thread_session_suffix_empty_or_none():
    result = parse_thread_session_suffix(None)
    assert result.base_session_key is None
    assert result.thread_id is None


def test_parse_thread_session_suffix_uses_last_thread_marker():
    result = parse_thread_session_suffix("agent:main:matrix:channel:room:thread:first:thread:second")
    assert result.base_session_key == "agent:main:matrix:channel:room:thread:first"
    assert result.thread_id == "second"


# -- parse_raw_session_conversation_ref --


def test_parse_raw_session_conversation_ref_agent_scoped():
    ref = parse_raw_session_conversation_ref(f"agent:main:matrix:channel:{ROOM_A}")
    assert ref is not None
    assert ref.channel == "matrix"
    assert ref.kind == "channel"
    assert ref.raw_id == ROOM_A
    assert ref.prefix == "agent:main:matrix:channel"


def test_parse_raw_session_conversation_ref_unscoped():
    ref = parse_raw_session_conversation_ref(f"matrix:group:{ROOM_B}")
    assert ref is not None
    assert ref.channel == "matrix"
    assert ref.kind == "group"
    assert ref.raw_id == ROOM_B
    assert ref.prefix == "matrix:group"


def test_parse_raw_session_conversation_ref_rejects_invalid_kind():
    assert parse_raw_session_conversation_ref("agent:main:matrix:direct:abc") is None


def test_parse_raw_session_conversation_ref_rejects_too_short_or_empty():
    assert parse_raw_session_conversation_ref("matrix:channel") is None
    assert parse_raw_session_conversation_ref(None) is None
    assert parse_raw_session_conversation_ref("") is None

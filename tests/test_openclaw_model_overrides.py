"""Tests for the openclaw_adapted model-overrides port.

Origin: core/lib/openclaw_adapted/model_overrides.py (ported from
openclaw/openclaw, MIT). The 8 cases below are translated directly from
upstream src/sessions/model-overrides.test.ts (pinned commit
e2c567538d8964ab594f63ea3121ee72149f273d). `entry` is mutated in place,
matching the upstream contract -- see the module docstring.
"""
import time

from core.lib.openclaw_adapted.model_overrides import (
    ModelOverrideSelection,
    apply_model_override_to_session_entry,
    repair_provider_wrapped_model_override,
)


def _apply_openai_selection(entry: dict) -> dict:
    return apply_model_override_to_session_entry(
        entry=entry, selection=ModelOverrideSelection(provider="openai", model="gpt-5.4")
    )


def _expect_runtime_model_fields_cleared(entry: dict, before: int) -> None:
    assert entry["providerOverride"] == "openai"
    assert entry["modelOverride"] == "gpt-5.4"
    assert "modelProvider" not in entry
    assert "model" not in entry
    assert entry.get("updatedAt", 0) > before


def _context_budget_status(updated_at: int, provider: str, model: str, budget: int) -> dict:
    return {
        "schemaVersion": 1,
        "source": "pre-prompt-estimate",
        "updatedAt": updated_at,
        "provider": provider,
        "model": model,
        "contextTokenBudget": budget,
    }


def test_clears_stale_runtime_model_fields_when_switching_overrides():
    before = int(time.time() * 1000) - 5_000
    entry = {
        "sessionId": "sess-1",
        "updatedAt": before,
        "modelProvider": "anthropic",
        "model": "claude-sonnet-4-6",
        "providerOverride": "anthropic",
        "modelOverride": "claude-sonnet-4-6",
        "contextTokens": 160_000,
        "contextBudgetStatus": _context_budget_status(before, "anthropic", "claude-sonnet-4-6", 200_000),
        "fallbackNoticeSelectedModel": "anthropic/claude-sonnet-4-6",
        "fallbackNoticeActiveModel": "anthropic/claude-sonnet-4-6",
        "fallbackNoticeReason": "provider temporary failure",
    }

    result = _apply_openai_selection(entry)

    assert result["updated"] is True
    _expect_runtime_model_fields_cleared(entry, before)
    assert "contextTokens" not in entry
    assert "contextBudgetStatus" not in entry
    assert "fallbackNoticeSelectedModel" not in entry
    assert "fallbackNoticeActiveModel" not in entry
    assert "fallbackNoticeReason" not in entry
    assert entry["modelOverrideSource"] == "user"


def test_clears_stale_runtime_fields_even_when_override_selection_unchanged():
    before = int(time.time() * 1000) - 5_000
    entry = {
        "sessionId": "sess-2",
        "updatedAt": before,
        "modelProvider": "anthropic",
        "model": "claude-sonnet-4-6",
        "providerOverride": "openai",
        "modelOverride": "gpt-5.4",
        "contextTokens": 160_000,
        "contextBudgetStatus": _context_budget_status(before, "anthropic", "claude-sonnet-4-6", 200_000),
    }

    result = _apply_openai_selection(entry)

    assert result["updated"] is True
    _expect_runtime_model_fields_cleared(entry, before)
    assert "contextTokens" not in entry
    assert "contextBudgetStatus" not in entry


def test_retains_aligned_runtime_fields_when_selection_and_runtime_already_match():
    before = int(time.time() * 1000) - 5_000
    entry = {
        "sessionId": "sess-3",
        "updatedAt": before,
        "modelProvider": "openai",
        "model": "gpt-5.4",
        "providerOverride": "openai",
        "modelOverride": "gpt-5.4",
        "contextTokens": 200_000,
        "contextBudgetStatus": _context_budget_status(before, "openai", "gpt-5.4", 200_000),
    }

    result = apply_model_override_to_session_entry(
        entry=entry, selection=ModelOverrideSelection(provider="openai", model="gpt-5.4")
    )

    assert result["updated"] is True
    assert entry["modelProvider"] == "openai"
    assert entry["model"] == "gpt-5.4"
    assert entry["modelOverrideSource"] == "user"
    assert entry["contextTokens"] == 200_000
    assert entry["contextBudgetStatus"]["contextTokenBudget"] == 200_000
    assert entry.get("updatedAt", 0) >= before


def test_clears_stale_context_tokens_when_switching_back_to_default_model():
    before = int(time.time() * 1000) - 5_000
    entry = {
        "sessionId": "sess-4",
        "updatedAt": before,
        "providerOverride": "local",
        "modelOverride": "sunapi386/llama-3-lexi-uncensored:8b",
        "contextTokens": 4_096,
        "contextBudgetStatus": _context_budget_status(
            before, "local", "sunapi386/llama-3-lexi-uncensored:8b", 4_096
        ),
    }

    result = apply_model_override_to_session_entry(
        entry=entry,
        selection=ModelOverrideSelection(provider="local", model="llama3.1:8b", is_default=True),
    )

    assert result["updated"] is True
    assert "providerOverride" not in entry
    assert "modelOverride" not in entry
    assert "modelOverrideSource" not in entry
    assert "contextTokens" not in entry
    assert "contextBudgetStatus" not in entry
    assert entry.get("updatedAt", 0) > before


def test_marks_non_default_overrides_with_provided_source():
    entry = {"sessionId": "sess-5a", "updatedAt": int(time.time() * 1000) - 5_000}

    result = apply_model_override_to_session_entry(
        entry=entry,
        selection=ModelOverrideSelection(provider="anthropic", model="claude-sonnet-4-6"),
        selection_source="auto",
    )

    assert result["updated"] is True
    assert entry["providerOverride"] == "anthropic"
    assert entry["modelOverride"] == "claude-sonnet-4-6"
    assert entry["modelOverrideSource"] == "auto"


def test_sets_live_model_switch_pending_only_when_explicitly_requested():
    base_entry = {
        "sessionId": "sess-5",
        "updatedAt": int(time.time() * 1000) - 5_000,
        "providerOverride": "anthropic",
        "modelOverride": "claude-sonnet-4-6",
    }

    without_flag_entry = dict(base_entry)
    without_flag = apply_model_override_to_session_entry(
        entry=without_flag_entry,
        selection=ModelOverrideSelection(provider="openai", model="gpt-5.4"),
    )
    assert without_flag["updated"] is True
    assert "liveModelSwitchPending" not in without_flag_entry

    with_flag_entry = dict(base_entry)
    with_flag = apply_model_override_to_session_entry(
        entry=with_flag_entry,
        selection=ModelOverrideSelection(provider="openai", model="gpt-5.4"),
        mark_live_switch_pending=True,
    )
    assert with_flag["updated"] is True
    assert with_flag_entry["liveModelSwitchPending"] is True


def test_marks_profile_only_switches_as_pending_when_requested():
    entry = {
        "sessionId": "sess-profile-switch",
        "updatedAt": int(time.time() * 1000) - 5_000,
        "providerOverride": "openai",
        "modelOverride": "gpt-5.4",
        "authProfileOverride": "oldprofile",
        "authProfileOverrideSource": "user",
    }

    result = apply_model_override_to_session_entry(
        entry=entry,
        selection=ModelOverrideSelection(provider="openai", model="gpt-5.4"),
        profile_override="newprofile",
        mark_live_switch_pending=True,
    )

    assert result["updated"] is True
    assert entry["authProfileOverride"] == "newprofile"
    assert entry["liveModelSwitchPending"] is True


def test_restores_provider_wrapped_override_from_aligned_runtime_model_fields():
    before = int(time.time() * 1000) - 5_000
    entry = {
        "sessionId": "sess-openrouter-repair-runtime",
        "updatedAt": before,
        "providerOverride": "anthropic",
        "modelOverride": "claude-haiku-4.5",
        "modelOverrideSource": "user",
        "modelProvider": "openrouter",
        "model": "anthropic/claude-haiku-4.5",
        "contextTokens": 200_000,
    }

    result = repair_provider_wrapped_model_override(
        entry=entry, default_provider="openai", default_model="gpt-5.4"
    )

    assert result["updated"] is True
    assert entry["providerOverride"] == "openrouter"
    assert entry["modelOverride"] == "anthropic/claude-haiku-4.5"
    assert entry["modelOverrideSource"] == "user"
    assert "modelProvider" not in entry
    assert "model" not in entry
    assert "contextTokens" not in entry
    assert entry.get("updatedAt", 0) > before


def test_clears_provider_wrapped_override_matching_configured_default():
    before = int(time.time() * 1000) - 5_000
    entry = {
        "sessionId": "sess-openrouter-repair-default",
        "updatedAt": before,
        "providerOverride": "anthropic",
        "modelOverride": "claude-haiku-4.5",
        "modelOverrideSource": "user",
    }

    result = repair_provider_wrapped_model_override(
        entry=entry, default_provider="openrouter", default_model="anthropic/claude-haiku-4.5"
    )

    assert result["updated"] is True
    assert "providerOverride" not in entry
    assert "modelOverride" not in entry
    assert "modelOverrideSource" not in entry
    assert entry.get("updatedAt", 0) > before


# -- boundary cases (fuzz-testing-constraints.md) --


def test_repair_returns_not_updated_when_no_override_present():
    entry = {"sessionId": "sess-empty"}
    result = repair_provider_wrapped_model_override(entry=entry, default_provider="openai")
    assert result["updated"] is False


def test_empty_entry_does_not_crash():
    entry: dict = {}
    result = apply_model_override_to_session_entry(
        entry=entry, selection=ModelOverrideSelection(provider="openai", model="gpt-5.4")
    )
    assert result["updated"] is True
    assert entry["providerOverride"] == "openai"

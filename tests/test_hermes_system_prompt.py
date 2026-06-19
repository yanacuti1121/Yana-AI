"""Smoke test for the ported system_prompt tiering architecture.

Origin: core/lib/hermes_adapted/system_prompt.py
        (ported pattern from NousResearch/hermes-agent, MIT)
"""
from core.lib.hermes_adapted.system_prompt import (
    PlatformHintOverride,
    SystemPromptBuilder,
    model_family_guidance,
    resolve_platform_hint,
)


def test_builder_joins_three_tiers_in_order():
    builder = SystemPromptBuilder(
        stable=[lambda: "IDENTITY"],
        context=[lambda: "AGENTS.md content"],
        volatile=[lambda: "timestamp: 2026-06-19"],
    )
    prompt = builder.build()
    assert prompt == "IDENTITY\n\nAGENTS.md content\n\ntimestamp: 2026-06-19"


def test_builder_skips_falsy_sections():
    builder = SystemPromptBuilder(stable=[lambda: "IDENTITY", lambda: None, lambda: ""])
    assert builder.build() == "IDENTITY"


def test_builder_caches_until_invalidated():
    calls = {"n": 0}

    def counted():
        calls["n"] += 1
        return f"call-{calls['n']}"

    builder = SystemPromptBuilder(stable=[counted])
    first = builder.build()
    second = builder.build()
    assert first == second == "call-1"  # cached, not rebuilt

    builder.invalidate()
    third = builder.build()
    assert third == "call-2"  # rebuilt after invalidate


def test_resolve_platform_hint_none_returns_default():
    assert resolve_platform_hint("default", None) == "default"


def test_resolve_platform_hint_bare_string_appends():
    assert resolve_platform_hint("default", "extra") == "default\n\nextra"


def test_resolve_platform_hint_replace_wins_as_base():
    override = PlatformHintOverride(replace="new base", append="extra")
    assert resolve_platform_hint("default", override) == "new base\n\nextra"


def test_model_family_guidance_matches_and_dedupes():
    guidance_map = {"gpt": "OPENAI_STYLE", "codex": "OPENAI_STYLE", "gemini": "GOOGLE_STYLE"}
    result = model_family_guidance("gpt-5-codex", guidance_map)
    assert result == ["OPENAI_STYLE"]  # matched twice, included once


def test_model_family_guidance_no_match_returns_empty():
    assert model_family_guidance("claude-sonnet-4-6", {"gpt": "X"}) == []

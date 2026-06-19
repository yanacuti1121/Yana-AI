"""System-prompt tiering architecture — ported pattern, not ported content.

Origin:  NousResearch/hermes-agent @ 5378b941209d8f62a65455041658ce8ce8144cc9
         agent/system_prompt.py (MIT License)
Ported:  2026-06-19.

**Scope note (read before extending):** unlike context_compressor.py and
tool_guardrails.py, most of the original file's *content* is hermes-product-
specific (SOUL.md identity loading, kanban worker guidance, nous subscription
prompts, computer_use/macOS blocks) and genuinely not portable — there is no
Yana AI equivalent for "kanban worker lifecycle" or "nous subscription". What
*is* portable, and is what this module ports, is the architecture:

  1. Three-tier system prompt (stable / context / volatile), joined with
     blank lines, assembled from a list of pluggable section providers.
  2. Cache-once-per-session semantics: the assembled prompt is rebuilt only
     when explicitly invalidated (e.g. after a context compression), never
     on every turn — this is what keeps a provider's prompt-prefix cache
     warm across a long conversation.
  3. Platform-hint override resolution (replace / append semantics) —
     `resolve_platform_hint()`, ported close to verbatim since it was
     already a pure, generic function in the original.
  4. Model-family guidance injection — match the active model name against
     family substrings (gemini/gpt/codex/...) and inject the matching
     operational-guidance block. The matching pattern is ported; the actual
     guidance text is Yana AI's own to write.
License: MIT (see vendor/hermes-agent/_upstream/LICENSE)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

TierName = str  # "stable" | "context" | "volatile"


@dataclass
class SystemPromptBuilder:
    """Assemble a 3-tier system prompt and cache it until invalidated.

    Each tier holds an ordered list of zero-arg callables; a callable
    returning falsy is skipped. Tiers are joined with "\\n\\n", and the
    three tier strings are themselves joined with "\\n\\n".
    """
    stable: List[Callable[[], Optional[str]]] = field(default_factory=list)
    context: List[Callable[[], Optional[str]]] = field(default_factory=list)
    volatile: List[Callable[[], Optional[str]]] = field(default_factory=list)

    _cached: Optional[str] = field(default=None, repr=False)

    def invalidate(self) -> None:
        """Force a rebuild on the next `build()` call (e.g. after compression)."""
        self._cached = None

    def _render_tier(self, providers: List[Callable[[], Optional[str]]]) -> str:
        parts = [p() for p in providers]
        return "\n\n".join(p for p in parts if p)

    def build(self, *, force: bool = False) -> str:
        if self._cached is not None and not force:
            return self._cached
        rendered = [self._render_tier(t) for t in (self.stable, self.context, self.volatile)]
        self._cached = "\n\n".join(r for r in rendered if r)
        return self._cached


@dataclass(frozen=True)
class PlatformHintOverride:
    replace: Optional[str] = None
    append: Optional[str] = None


def resolve_platform_hint(default_hint: str, override: Optional[PlatformHintOverride | str]) -> str:
    """Apply a per-platform prompt-hint override to a default hint.

    - `override` is None            -> return default_hint unchanged.
    - `override` is a bare string   -> treated as append (shorthand).
    - `override.replace` is set     -> replaces the default outright.
    - `override.append` is set      -> appended after the (possibly replaced) base.
    - `replace` and `append` both set -> both apply (replace wins as the base).

    Defensive: malformed input (empty strings) falls back to the unmodified
    default so a bad config value never breaks prompt assembly.
    """
    if override is None:
        return default_hint
    if isinstance(override, str):
        extra = override.strip()
        return f"{default_hint}\n\n{extra}".strip() if extra else default_hint

    base = override.replace.strip() if override.replace and override.replace.strip() else default_hint
    if override.append and override.append.strip():
        return f"{base}\n\n{override.append.strip()}".strip()
    return base


def model_family_guidance(model: str, guidance_map: Dict[str, str]) -> List[str]:
    """Match `model` against family-name substrings and collect guidance blocks.

    `guidance_map` keys are lowercase substrings to match against the model
    name (e.g. {"gemini": GOOGLE_GUIDANCE, "gemma": GOOGLE_GUIDANCE, "gpt":
    OPENAI_GUIDANCE}); values are the guidance text to inject when matched.
    Each guidance block is included at most once even if matched by
    multiple substrings (e.g. a guidance block shared by "gpt" and "codex").
    """
    model_lower = (model or "").lower()
    seen: set[str] = set()
    matched: List[str] = []
    for substring, guidance in guidance_map.items():
        if substring in model_lower and guidance not in seen:
            seen.add(guidance)
            matched.append(guidance)
    return matched

"""CJK-aware character counting for accurate token estimation — port.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/utils/cjk-chars.ts (MIT)
Ported:  2026-06-25, for the context-pruning subsystem port.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Most LLM tokenizers encode CJK (Chinese, Japanese, Korean) characters as
roughly 1 token per character, whereas Latin/ASCII text averages ~1 token
per 4 characters. This module inflates the character count of CJK text so
the standard `chars / 4` formula yields an accurate token estimate.

Porting note: the upstream JS counts string length in UTF-16 code units, then
corrects CJK Extension B+ surrogate pairs back down to 1 unit each (since
JS .length counts them as 2). Python strings are already sequences of code
points, so `len()` has no surrogate-pair inflation to correct — but it also
has no way to reproduce the *deliberate* UTF-16 quirk upstream keeps for
non-CJK supplementary-plane characters (emoji etc.), which upstream leaves
weighted at 2 "chars" each. `_codepoint_weight` below reproduces that exact
per-codepoint weighting instead of relying on len(), so token estimates for
emoji-bearing text stay numerically identical to upstream.
"""
from __future__ import annotations

import re

CHARS_PER_TOKEN_ESTIMATE = 4

_NON_LATIN_RE = re.compile(
    "[⺀-鿿ꀀ-꓿가-힯豈-﫿\U00020000-\U0002fa1f]"
)

_SUPPLEMENTARY_PLANE_START = 0x10000


def _codepoint_weight(is_non_latin: bool, code_point: int) -> int:
    """UTF-16-equivalent unit weight for one code point (see module docstring)."""
    if code_point >= _SUPPLEMENTARY_PLANE_START and not is_non_latin:
        return 2
    return 1


def estimate_string_chars(text: str) -> int:
    """Adjusted character length accounting for non-Latin (CJK, etc.) text.

    For pure ASCII/Latin text the return value equals len(text) (no change).
    """
    if not text:
        return 0
    non_latin_count = 0
    weighted_length = 0
    for ch in text:
        is_non_latin = _NON_LATIN_RE.match(ch) is not None
        if is_non_latin:
            non_latin_count += 1
        weighted_length += _codepoint_weight(is_non_latin, ord(ch))
    return weighted_length + non_latin_count * (CHARS_PER_TOKEN_ESTIMATE - 1)


def estimate_tokens_from_chars(chars: int) -> int:
    """Estimate token count from a raw character count (rounds up, clamps to 0)."""
    import math

    return math.ceil(max(0, chars) / CHARS_PER_TOKEN_ESTIMATE)

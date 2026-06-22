"""String normalization helpers used by the openclaw sessions ports.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         packages/normalization-core/src/string-coerce.ts
         (normalizeNullableString, normalizeOptionalString,
         normalizeOptionalLowercaseString, normalizeLowercaseStringOrEmpty) (MIT)
Ported:  2026-06-22. Direct translation of the four functions actually
         imported by the src/sessions/ modules being ported in this batch
         (session-key-utils.ts, session-chat-type*.ts, session-id-resolution.ts,
         input-provenance.ts, model-overrides.ts, transcript-events.ts,
         send-policy.ts). The rest of string-coerce.ts (readStringValue,
         normalizeStringifiedOptionalString, normalizeStringifiedEntries,
         normalizeFastMode, the locale/whitespace helpers, thread-id helpers)
         was not needed by any sessions module and is not ported here.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations


def normalize_nullable_string(value: object) -> str | None:
    """Trim string input and return None for non-strings or empty strings."""
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def normalize_optional_string(value: object) -> str | None:
    """Trim string input and return None for non-strings or empty strings.

    Mirrors the upstream `string | undefined` return type as `str | None`.
    """
    return normalize_nullable_string(value)


def normalize_optional_lowercase_string(value: object) -> str | None:
    """Lowercase a normalized optional string."""
    normalized = normalize_optional_string(value)
    return normalized.lower() if normalized is not None else None


def normalize_lowercase_string_or_empty(value: object) -> str:
    """Lowercase a normalized string, or return an empty string when absent."""
    return normalize_optional_lowercase_string(value) or ""

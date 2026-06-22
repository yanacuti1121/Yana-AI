"""Pipe-filter implementations for the sandboxed expression evaluator.

Origin:  github/spec-kit, src/specify_cli/workflows/expressions.py (MIT)
         -- https://github.com/github/spec-kit. See expressions.py in this
         package for the full port rationale and provenance notes.
Ported:  2026-06-22. Split out of the single upstream module purely to
         keep each file under this repo's 300-line hard limit
         (agent-code-constraints.md) -- no behavior change.
         `_filter_map`'s original body was 5 levels of nested if/for
         (over the hard nesting-depth limit of 3); `_resolve_map_attr`
         below extracts the per-item dotted-path walk with an early
         return on the first non-dict, called from a flat list
         comprehension -- same precedence (check dict-ness before each
         `.get`, stop at the first non-dict), just flattened.
License: MIT (see vendor/spec-kit/_upstream/LICENSE)
"""
from __future__ import annotations

import json
from typing import Any


def filter_default(value: Any, default_value: Any = "") -> Any:
    """Return *default_value* when *value* is ``None`` or empty string."""
    if value is None or value == "":
        return default_value
    return value


def filter_join(value: Any, separator: str = ", ") -> str:
    """Join a list into a string with *separator*."""
    if isinstance(value, list):
        return separator.join(str(v) for v in value)
    return str(value)


def _resolve_map_attr(item: Any, attr: str) -> Any:
    if not isinstance(item, dict):
        return item
    # Support dot notation: "result.status" -> item["result"]["status"]
    value: Any = item
    for part in attr.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def filter_map(value: Any, attr: str) -> list[Any]:
    """Map a list of dicts to a specific (possibly dotted) attribute."""
    if not isinstance(value, list):
        return []
    return [_resolve_map_attr(item, attr) for item in value]


def filter_contains(value: Any, substring: str) -> bool:
    """Check if a string or list contains *substring*."""
    if isinstance(value, str):
        return substring in value
    if isinstance(value, list):
        return substring in value
    return False


def filter_from_json(value: Any) -> Any:
    """Parse a JSON string into a typed value (list/dict/scalar).

    Raises ``ValueError`` on non-string input or invalid JSON -- a parse
    failure here means the pipeline wiring is wrong, and silently passing
    the unparsed value through would hide it.
    """
    if not isinstance(value, str):
        raise ValueError(f"from_json: expected a JSON string, got {type(value).__name__}")
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"from_json: invalid JSON: {exc}") from exc

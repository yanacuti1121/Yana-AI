"""Expression-grammar dispatcher for the sandboxed expression evaluator.

Origin:  github/spec-kit, src/specify_cli/workflows/expressions.py (MIT)
         -- https://github.com/github/spec-kit. See expressions.py in this
         package for the full port rationale and provenance notes.
Ported:  2026-06-22. This is the upstream `_evaluate_simple_expression`
         (originally one ~130-line if/elif chain, over this repo's hard
         50-line function-length limit) plus its `_resolve_dot_path`
         fallback, split out of the single upstream module to keep each
         file under the 300-line hard limit (agent-code-constraints.md).

         `_evaluate_simple_expression` is split into one small `_match_*`
         helper per expression form (string literal, pipe filter, `or`,
         `and`, `not`, comparison, numeric/boolean/null/list literal),
         each returning the private `_NO_MATCH` sentinel when it doesn't
         apply. The dispatcher walks the helpers in the original
         precedence order and returns the first non-sentinel result,
         falling back to dot-path variable resolution -- same control
         flow as the original if/elif chain, just data-driven instead of
         one long function body. Behavior is unchanged, verified against
         the upstream test suite (see tests/test_spec_kit_expressions.py).
License: MIT (see vendor/spec-kit/_upstream/LICENSE)
"""
from __future__ import annotations

import re
from typing import Any

from core.lib.spec_kit_adapted.expression_filters import (
    filter_contains,
    filter_default,
    filter_from_json,
    filter_join,
    filter_map,
)

_NO_MATCH = object()


def resolve_dot_path(obj: Any, path: str) -> Any:
    """Resolve a dotted path like ``steps.specify.output.file`` against *obj*.

    Supports dict key access and list indexing (e.g., ``task_list[0]``).
    """
    parts = path.split(".")
    current = obj
    for part in parts:
        idx_match = re.match(r"^([\w-]+)\[(\d+)\]$", part)
        if idx_match:
            key, idx = idx_match.group(1), int(idx_match.group(2))
            if isinstance(current, dict):
                current = current.get(key)
            else:
                return None
            if isinstance(current, list) and 0 <= idx < len(current):
                current = current[idx]
            else:
                return None
        elif isinstance(current, dict):
            current = current.get(part)
        else:
            return None
        if current is None:
            return None
    return current


def _match_string_literal(expr: str, namespace: dict[str, Any]) -> Any:
    if (expr.startswith("'") and expr.endswith("'")) or (
        expr.startswith('"') and expr.endswith('"')
    ):
        return expr[1:-1]
    return _NO_MATCH


def _match_pipe_filter(expr: str, namespace: dict[str, Any]) -> Any:
    if "|" not in expr:
        return _NO_MATCH
    parts = expr.split("|", 1)
    value = evaluate_simple_expression(parts[0].strip(), namespace)
    filter_expr = parts[1].strip()

    # `from_json` is strict: it takes no arguments and tolerates no trailing
    # tokens. Every mis-wired form fails loudly instead of silently falling
    # through to the unknown-filter path and returning the unparsed value.
    leading = re.match(r"\w+", filter_expr)
    if leading and leading.group(0) == "from_json":
        if filter_expr != "from_json":
            raise ValueError(
                "from_json: expected '| from_json' with no arguments or "
                f"trailing tokens, got '| {filter_expr}'"
            )
        return filter_from_json(value)

    filter_match = re.match(r"(\w+)\((.+)\)", filter_expr)
    if filter_match:
        fname = filter_match.group(1)
        farg = evaluate_simple_expression(filter_match.group(2).strip(), namespace)
        if fname == "default":
            return filter_default(value, farg)
        if fname == "join":
            return filter_join(value, farg)
        if fname == "map":
            return filter_map(value, farg)
        if fname == "contains":
            return filter_contains(value, farg)

    filter_name = filter_expr.strip()
    if filter_name == "default":
        return filter_default(value)
    return value


def _match_or(expr: str, namespace: dict[str, Any]) -> Any:
    if " or " not in expr:
        return _NO_MATCH
    # Lower precedence than 'and': 'a or b and c' == 'a or (b and c)'.
    left, right = expr.split(" or ", 1)
    return bool(evaluate_simple_expression(left.strip(), namespace)) or bool(
        evaluate_simple_expression(right.strip(), namespace)
    )


def _match_and(expr: str, namespace: dict[str, Any]) -> Any:
    if " and " not in expr:
        return _NO_MATCH
    left, right = expr.split(" and ", 1)
    return bool(evaluate_simple_expression(left.strip(), namespace)) and bool(
        evaluate_simple_expression(right.strip(), namespace)
    )


def _match_not(expr: str, namespace: dict[str, Any]) -> Any:
    if not expr.startswith("not "):
        return _NO_MATCH
    inner = evaluate_simple_expression(expr[4:].strip(), namespace)
    return not bool(inner)


def _safe_compare(left: Any, right: Any, op: str) -> bool:
    """Safely compare two values, coercing numeric strings when possible."""
    try:
        if isinstance(left, str):
            left = float(left) if "." in left else int(left)
        if isinstance(right, str):
            right = float(right) if "." in right else int(right)
    except (ValueError, TypeError):
        return False
    try:
        if op == ">":
            return left > right  # type: ignore[operator]
        if op == "<":
            return left < right  # type: ignore[operator]
        if op == ">=":
            return left >= right  # type: ignore[operator]
        if op == "<=":
            return left <= right  # type: ignore[operator]
    except TypeError:
        return False
    return False


# Order matters -- multi-char ops must be checked before their single-char
# prefixes (e.g. ">=" before ">").
_COMPARISON_OPS = ("!=", "==", ">=", "<=", ">", "<", " not in ", " in ")


def _match_comparison(expr: str, namespace: dict[str, Any]) -> Any:
    for op in _COMPARISON_OPS:
        if op not in expr:
            continue
        left_raw, right_raw = expr.split(op, 1)
        left = evaluate_simple_expression(left_raw.strip(), namespace)
        right = evaluate_simple_expression(right_raw.strip(), namespace)
        if op == "==":
            return left == right
        if op == "!=":
            return left != right
        if op == ">":
            return _safe_compare(left, right, ">")
        if op == "<":
            return _safe_compare(left, right, "<")
        if op == ">=":
            return _safe_compare(left, right, ">=")
        if op == "<=":
            return _safe_compare(left, right, "<=")
        if op == " in ":
            return left in right if right is not None else False
        if op == " not in ":
            return left not in right if right is not None else True
    return _NO_MATCH


def _match_numeric_literal(expr: str, namespace: dict[str, Any]) -> Any:
    try:
        if "." in expr:
            return float(expr)
        return int(expr)
    except (ValueError, TypeError):
        return _NO_MATCH


def _match_boolean_literal(expr: str, namespace: dict[str, Any]) -> Any:
    lowered = expr.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    return _NO_MATCH


def _match_null_literal(expr: str, namespace: dict[str, Any]) -> Any:
    if expr.lower() in ("none", "null"):
        return None
    return _NO_MATCH


def _match_list_literal(expr: str, namespace: dict[str, Any]) -> Any:
    if not (expr.startswith("[") and expr.endswith("]")):
        return _NO_MATCH
    inner = expr[1:-1].strip()
    if not inner:
        return []
    return [evaluate_simple_expression(item.strip(), namespace) for item in inner.split(",")]


# Checked in this exact order -- the original's if/elif precedence,
# now data-driven instead of a single long chain.
_EXPRESSION_MATCHERS = (
    _match_string_literal,
    _match_pipe_filter,
    _match_or,
    _match_and,
    _match_not,
    _match_comparison,
    _match_numeric_literal,
    _match_boolean_literal,
    _match_null_literal,
    _match_list_literal,
)


def evaluate_simple_expression(expr: str, namespace: dict[str, Any]) -> Any:
    """Evaluate a simple expression against the namespace.

    Supports: dot-path access, comparisons, boolean operators, ``in``/
    ``not in``, pipe filters (``default``, ``join``, ``contains``,
    ``from_json``, ``map``), and string/numeric/boolean/null/list literals.
    Falls back to dot-path variable resolution when nothing else matches.
    """
    expr = expr.strip()
    for matcher in _EXPRESSION_MATCHERS:
        result = matcher(expr, namespace)
        if result is not _NO_MATCH:
            return result
    return resolve_dot_path(namespace, expr)

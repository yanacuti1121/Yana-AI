"""Sandboxed expression evaluator for workflow templates.

Origin:  github/spec-kit, src/specify_cli/workflows/expressions.py (MIT)
         -- https://github.com/github/spec-kit. Provided as a source zip
         snapshot (docs/spec-kit-main.zip), not a pinned git fetch -- no
         exact commit SHA available; zip extraction timestamp 2026-06-22
         cited instead.
Ported:  2026-06-22. Direct translation of the full module -- it was
         already pure Python with zero internal spec-kit dependencies
         (only stdlib `json`/`re`/`typing`), so no language translation
         was needed. Split into three files (this one + expression_matchers.py
         + expression_filters.py) purely to satisfy this repo's hard
         300-line-per-file and 50-line-per-function limits
         (agent-code-constraints.md) -- see expression_matchers.py's
         docstring for the structural-change details. Behavior is
         identical to upstream, verified against its translated test
         suite (tests/test_spec_kit_expressions.py).

         `StepContext` (the duck-typed object this module reads
         `inputs`/`steps`/`item`/`fan_in`/`run_id` off of via `hasattr`/
         `getattr`) is NOT ported -- it's part of the unported workflow
         engine (src/specify_cli/workflows/base.py, engine.py). This
         module never imported that class upstream either, so it was
         already decoupled before this port touched anything.
License: MIT (see vendor/spec-kit/_upstream/LICENSE)

Provides a safe Jinja2-like subset for evaluating `{{ ... }}` expressions in
workflow YAML. Expressions cannot perform file I/O, import modules, or run
arbitrary code -- the evaluator only walks a fixed namespace dict and applies
a fixed set of filters.
"""
from __future__ import annotations

import re
from typing import Any

from core.lib.spec_kit_adapted.expression_matchers import evaluate_simple_expression

_EXPR_PATTERN = re.compile(r"\{\{(.+?)\}\}")


def _build_namespace(context: Any) -> dict[str, Any]:
    """Build the variable namespace from a StepContext-shaped object."""
    ns: dict[str, Any] = {}
    if hasattr(context, "inputs"):
        ns["inputs"] = context.inputs or {}
    if hasattr(context, "steps"):
        ns["steps"] = context.steps or {}
    if hasattr(context, "item"):
        ns["item"] = context.item
    if hasattr(context, "fan_in"):
        ns["fan_in"] = context.fan_in or {}
    # Engine-managed runtime metadata. Always present (even outside a run)
    # so templates referencing it never error: `run_id` falls back to an
    # empty string when no run is active (dry-run, validation, ad-hoc
    # evaluator usage).
    run_id = getattr(context, "run_id", None) or ""
    ns["context"] = {"run_id": run_id}
    return ns


def evaluate_expression(template: str, context: Any) -> Any:
    """Evaluate a template string with ``{{ ... }}`` expressions.

    If the entire string is a single expression, returns the raw value
    (preserving type). Otherwise, substitutes each expression inline and
    returns a string.

    Parameters
    ----------
    template:
        The template string (e.g., ``"{{ steps.plan.output.task_count }}"``
        or ``"Processed {{ inputs.spec }}"``).
    context:
        A ``StepContext`` or compatible object.
    """
    if not isinstance(template, str):
        return template

    namespace = _build_namespace(context)

    match = _EXPR_PATTERN.fullmatch(template.strip())
    if match:
        return evaluate_simple_expression(match.group(1).strip(), namespace)

    def _replacer(m: re.Match[str]) -> str:
        val = evaluate_simple_expression(m.group(1).strip(), namespace)
        return str(val) if val is not None else ""

    return _EXPR_PATTERN.sub(_replacer, template)


def evaluate_condition(condition: str, context: Any) -> bool:
    """Evaluate a condition expression and return a boolean.

    Convenience wrapper around ``evaluate_expression`` that coerces the
    result to bool, treating plain "false"/"true" strings as booleans so
    that ``condition: "false"`` (without ``{{ }}``) behaves as expected.
    """
    result = evaluate_expression(condition, context)
    if isinstance(result, str):
        lower = result.lower()
        if lower == "false":
            return False
        if lower == "true":
            return True
    return bool(result)

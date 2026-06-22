"""Tests for the spec_kit_adapted expression-evaluator port.

Origin: core/lib/spec_kit_adapted/{expressions,expression_matchers,
expression_filters}.py (ported from github/spec-kit, MIT). The 24 tests
in `TestUpstreamParity` are translated 1:1 from upstream
`tests/test_workflows.py::TestExpressions` (pinned via the
docs/spec-kit-main.zip snapshot, see expressions.py's module docstring) --
same assertions, same expected values, not invented. `StepContext` (the
upstream fixture, defined in the unported workflow engine) is replaced
here with `_Ctx`, a minimal stand-in exposing only the attributes
`_build_namespace` actually reads (`inputs`, `steps`, `item`, `fan_in`,
`run_id`) -- the production code only ever uses `hasattr`/`getattr`
against these names, so this substitution is behaviorally exact, not a
weakened test double.

`TestBoundaryCases` adds the fuzz/boundary coverage required by
fuzz-testing-constraints.md (empty input, malicious/injection-shaped
input, very long input) for this string-parsing surface -- none of these
existed upstream, since that rule is local to this repo.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest

from core.lib.spec_kit_adapted.expressions import evaluate_condition, evaluate_expression


@dataclass
class _Ctx:
    """Minimal stand-in for spec-kit's StepContext (see module docstring)."""

    inputs: dict[str, Any] = field(default_factory=dict)
    steps: dict[str, dict[str, Any]] = field(default_factory=dict)
    item: Any = None
    fan_in: dict[str, Any] = field(default_factory=dict)
    run_id: str | None = None


class TestUpstreamParity:
    """Translated 1:1 from upstream TestExpressions (tests/test_workflows.py)."""

    def test_simple_variable(self):
        ctx = _Ctx(inputs={"name": "login"})
        assert evaluate_expression("{{ inputs.name }}", ctx) == "login"

    def test_step_output_reference(self):
        ctx = _Ctx(steps={"specify": {"output": {"file": "spec.md"}}})
        assert evaluate_expression("{{ steps.specify.output.file }}", ctx) == "spec.md"

    def test_string_interpolation(self):
        ctx = _Ctx(inputs={"name": "login"})
        result = evaluate_expression("Feature: {{ inputs.name }} done", ctx)
        assert result == "Feature: login done"

    def test_comparison_equals(self):
        ctx = _Ctx(inputs={"scope": "full"})
        assert evaluate_expression("{{ inputs.scope == 'full' }}", ctx) is True
        assert evaluate_expression("{{ inputs.scope == 'partial' }}", ctx) is False

    def test_comparison_not_equals(self):
        ctx = _Ctx(steps={"run-tests": {"output": {"exit_code": 1}}})
        result = evaluate_expression("{{ steps.run-tests.output.exit_code != 0 }}", ctx)
        assert result is True

    def test_numeric_comparison(self):
        ctx = _Ctx(steps={"plan": {"output": {"task_count": 7}}})
        assert evaluate_expression("{{ steps.plan.output.task_count > 5 }}", ctx) is True
        assert evaluate_expression("{{ steps.plan.output.task_count < 5 }}", ctx) is False

    def test_boolean_and(self):
        ctx = _Ctx(inputs={"a": True, "b": True})
        assert evaluate_expression("{{ inputs.a and inputs.b }}", ctx) is True

    def test_boolean_or(self):
        ctx = _Ctx(inputs={"a": False, "b": True})
        assert evaluate_expression("{{ inputs.a or inputs.b }}", ctx) is True

    def test_filter_default(self):
        ctx = _Ctx()
        assert evaluate_expression("{{ inputs.missing | default('fallback') }}", ctx) == "fallback"

    def test_filter_join(self):
        ctx = _Ctx(inputs={"tags": ["a", "b", "c"]})
        assert evaluate_expression("{{ inputs.tags | join(', ') }}", ctx) == "a, b, c"

    def test_filter_contains(self):
        ctx = _Ctx(inputs={"text": "hello world"})
        assert evaluate_expression("{{ inputs.text | contains('world') }}", ctx) is True

    def test_filter_from_json_parses_object(self):
        ctx = _Ctx(steps={"emit": {"output": {"stdout": '{"items": [1, 2, 3]}'}}})
        result = evaluate_expression("{{ steps.emit.output.stdout | from_json }}", ctx)
        assert result == {"items": [1, 2, 3]}

    def test_filter_from_json_invalid_json_raises(self):
        ctx = _Ctx(steps={"emit": {"output": {"stdout": "not json"}}})
        with pytest.raises(ValueError, match="from_json: invalid JSON"):
            evaluate_expression("{{ steps.emit.output.stdout | from_json }}", ctx)

    def test_filter_from_json_non_string_raises(self):
        ctx = _Ctx(steps={"emit": {"output": {"exit_code": 0}}})
        with pytest.raises(ValueError, match="expected a JSON string"):
            evaluate_expression("{{ steps.emit.output.exit_code | from_json }}", ctx)

    def test_filter_from_json_rejects_malformed_forms(self):
        # `from_json` is strict: no arguments and no trailing tokens. Every
        # mis-wired form -- parenthesized, accidental arg, or trailing
        # garbage -- must raise rather than silently fall through to the
        # unknown-filter path and return the unparsed value.
        ctx = _Ctx(steps={"emit": {"output": {"stdout": '{"a": 1}'}}})
        bad_forms = (
            "from_json()",
            "from_json('x')",
            "from_json ()",
            "from_json ('x')",
            "from_json)",
            "from_json extra",
            "from_json 'x'",
        )
        for bad in bad_forms:
            with pytest.raises(ValueError, match="from_json: expected"):
                evaluate_expression("{{ steps.emit.output.stdout | " + bad + " }}", ctx)

    def test_condition_evaluation(self):
        ctx = _Ctx(inputs={"ready": True})
        assert evaluate_condition("{{ inputs.ready }}", ctx) is True
        assert evaluate_condition("{{ inputs.missing }}", ctx) is False

    def test_non_string_passthrough(self):
        ctx = _Ctx()
        assert evaluate_expression(42, ctx) == 42
        assert evaluate_expression(None, ctx) is None

    def test_string_literal(self):
        ctx = _Ctx()
        assert evaluate_expression("{{ 'hello' }}", ctx) == "hello"

    def test_numeric_literal(self):
        ctx = _Ctx()
        assert evaluate_expression("{{ 42 }}", ctx) == 42

    def test_boolean_literal(self):
        ctx = _Ctx()
        assert evaluate_expression("{{ true }}", ctx) is True
        assert evaluate_expression("{{ false }}", ctx) is False

    def test_list_indexing(self):
        ctx = _Ctx(
            steps={"tasks": {"output": {"task_list": [{"file": "a.md"}, {"file": "b.md"}]}}}
        )
        result = evaluate_expression("{{ steps.tasks.output.task_list[0].file }}", ctx)
        assert result == "a.md"

    def test_context_run_id_resolves(self):
        """``{{ context.run_id }}`` resolves to the context's run id."""
        ctx = _Ctx(run_id="a1b2c3d4")
        assert evaluate_expression("{{ context.run_id }}", ctx) == "a1b2c3d4"

    def test_context_run_id_defaults_to_empty_when_unset(self):
        """No run active -> ``""``, never an error."""
        ctx = _Ctx()
        assert evaluate_expression("{{ context.run_id }}", ctx) == ""

    def test_context_run_id_string_interpolation(self):
        ctx = _Ctx(run_id="deadbeef")
        result = evaluate_expression("RUN_ID={{ context.run_id }}", ctx)
        assert result == "RUN_ID=deadbeef"


class TestBoundaryCases:
    """Fuzz/boundary coverage required by fuzz-testing-constraints.md."""

    def test_empty_template_string(self):
        assert evaluate_expression("", _Ctx()) == ""

    def test_empty_expression_braces(self):
        # No crash on a degenerate "{{ }}" -- resolves the empty dot-path
        # against the namespace, which has no "" key.
        assert evaluate_expression("{{  }}", _Ctx()) is None

    def test_max_length_input_does_not_hang_or_crash(self):
        huge = "a" * 65536
        # Not a recognized expression form -> falls through to dot-path
        # resolution, which simply returns None for an unknown top-level key.
        assert evaluate_expression("{{ " + huge + " }}", _Ctx()) is None

    def test_does_not_execute_arbitrary_code_via_dunder_lookup(self):
        # The evaluator only ever does dict.get() against a fixed namespace
        # -- there is no Python attribute access, so dunder/import-style
        # expressions can only ever resolve to None, never execute.
        ctx = _Ctx(inputs={"name": "x"})
        result = evaluate_expression(
            "{{ inputs.__class__.__init__.__globals__ }}", ctx
        )
        assert result is None

    def test_shell_metacharacters_in_string_literal_are_inert(self):
        ctx = _Ctx()
        result = evaluate_expression("{{ '; rm -rf / #' }}", ctx)
        assert result == "; rm -rf / #"

    def test_null_byte_in_template_is_treated_as_literal_text(self):
        ctx = _Ctx(inputs={"name": "x"})
        result = evaluate_expression("before\x00{{ inputs.name }}after", ctx)
        assert result == "before\x00xafter"

    def test_unicode_in_string_literal_round_trips(self):
        ctx = _Ctx()
        assert evaluate_expression("{{ '🔥 ‮RTL' }}", ctx) == "🔥 ‮RTL"

    def test_deeply_nested_json_in_from_json_does_not_crash(self):
        nested = ('{"a":' * 200) + "0" + ("}" * 200)
        ctx = _Ctx(steps={"emit": {"output": {"stdout": nested}}})
        result = evaluate_expression("{{ steps.emit.output.stdout | from_json }}", ctx)
        assert isinstance(result, dict)

    def test_unmatched_braces_pass_through_as_literal_text(self):
        ctx = _Ctx()
        assert evaluate_expression("{{ unterminated", ctx) == "{{ unterminated"

# Validator JSON Schema Checkpoint

**Status date:** 2026-05-27  
**Scope:** Validator JSON schema milestone checkpoint

---

## 1) Current status

- `.yana-ai/schemas/validator-output.schema.json` exists.
- `tests/test_validator_json_schema.py` exists.
- CI runs `tests/test_validator_json_schema.py`.
- `check-context --json` is covered by contract checks.
- `validate-spec --json` is covered by contract checks.
- `validate-spec --context-pack --json` is covered by contract checks.

---

## 2) Verified commands

- `python3 tests/test_validator_json_schema.py`
- `python3 tests/test_validate_spec.py`
- `python3 tests/test_context_pack_check.py`
- `python3 tests/test_yana-aiignore.py`
- `python3 tests/test_harness_schema_examples.py`

---

## 3) Known behavior

- Local runs may use fallback structural validation when `jsonschema` is unavailable.
- CI should enforce full `jsonschema` validation behavior.
- JSON validator output preserves existing exit codes `0/1/2`.
- Default human-readable output remains unchanged unless `--json` is provided.

---

## 4) Known limitations

- Schema currently allows additional properties for forward compatibility.
- Finding IDs are still intentionally simple.
- No audit JSON output in this phase.
- No SARIF extension in this phase.
- No baseline mode yet.

---

## 5) Next recommended work

1. Create an audit JSON output plan.
2. Implement audit JSON output in small phases.
3. Add audit JSON schema and regression test coverage.
4. Add/expand SARIF support later as a separate phase.

---

## 6) Positioning

- **Public:** Yana AI Agent Auditor.
- **Internal:** Harness Scaling / Control Layer.
- Do not market as “12 layers”.

# JSON Validators Checkpoint

**Status date:** 2026-05-27  
**Scope:** Phase JSON.1 + JSON.2 + JSON.3 checkpoint

---

## Current status

- `check-context --json` is implemented.
- `validate-spec --json` is implemented.
- `validate-spec --context-pack <dir> --json` is implemented.
- All three commands emit machine-readable JSON while preserving legacy human-readable output by default.

---

## Verified command set

- `python3 tests/test_validate_spec.py`
- `python3 tests/test_context_pack_check.py`
- `python3 tests/test_yana-aiignore.py`
- `python3 tests/test_harness_schema_examples.py`
- `bash bin/yana-ai validate-spec examples/specs/valid-task-spec.json --json`
- `bash bin/yana-ai validate-spec examples/specs/valid-task-spec.json --context-pack examples/context-packs/valid-basic --json`
- `bash bin/yana-ai check-context examples/context-packs/valid-basic --json`

---

## Behavior guarantees

- Exit code behavior is unchanged in JSON mode:
  - `0` = valid
  - `1` = invalid (findings)
  - `2` = usage/dependency/internal error
- Human-readable output remains default when `--json` is not provided.
- JSON output is parseable with Python `json` module.

---

## Why this checkpoint matters

This milestone confirms validator output can now serve both:

1. **Humans** (default readable terminal output), and
2. **Tools/automation** (structured JSON payloads)

without breaking existing workflows or exit-code contracts.

---

## Known limitations / risks

- No dedicated JSON output schema file for validator payloads yet.
- Finding IDs/severity levels are minimal and may need normalization for long-term analytics.
- No SARIF for validator commands in this phase.
- No baseline/suppression layer for validator JSON yet.

---

## Recommended next steps

1. Add a dedicated JSON output schema for validator payloads.
2. Validate emitted JSON against that schema in tests.
3. Later add audit JSON hardening.
4. Later add SARIF for audit path (separate phase).

---

## Positioning

- **Public:** Yana AI Agent Auditor
- **Internal:** Harness Scaling / Control Layer
- Do not market as “12 layers”.

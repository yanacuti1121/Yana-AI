# JSON Output Plan for Yana AI Validators

**Status date:** 2026-05-27  
**Scope:** Planning only (no runtime implementation)

---

## 1) Purpose

- JSON output enables machine-readable validation results for automation.
- First targets are:
  - `validate-spec`
  - `check-context`
- Default output remains human-readable to preserve current UX.
- JSON mode prepares integration paths for CI parsing, dashboards, and future policy tooling.

---

## 2) Proposed commands

- `bash bin/yana-ai validate-spec <spec-file> --json`
- `bash bin/yana-ai validate-spec <spec-file> --context-pack <context-pack-dir> --json`
- `bash bin/yana-ai check-context <context-pack-dir> --json`

---

## 3) Output contract (minimal)

Proposed top-level JSON fields:

- `tool`
- `command`
- `status` (`valid` | `invalid` | `error`)
- `exit_code`
- `mode` (`full-jsonschema` | `fallback-structural` | `rule-based`)
- `target`
- `findings` (array)
- `summary`
- `schema_version` (or `version`)

### Example shape

```json
{
  "tool": "yana-ai",
  "command": "validate-spec",
  "status": "invalid",
  "exit_code": 1,
  "mode": "fallback-structural",
  "target": "examples/specs/invalid-task-spec.json",
  "findings": [],
  "summary": {
    "total": 1,
    "invalid": 1
  },
  "schema_version": "json-output-v1"
}
```

---

## 4) Finding object

Proposed fields per finding:

- `id`
- `severity`
- `message`
- `file`
- `rule`
- `evidence` (optional)
- `recommendation` (optional)

Notes:

- Keep `id` stable where possible for downstream filtering.
- Keep `severity` simple initially (`low|medium|high` or validator-specific mapping).

---

## 5) Exit code behavior

JSON mode must preserve current exit semantics:

- `0` = valid
- `1` = invalid (or findings exist)
- `2` = usage/dependency/internal error

No behavior change between human mode and `--json`; only output format differs.

---

## 6) Backward compatibility

- Human-readable output remains default.
- JSON mode is opt-in only (`--json`).
- Existing tests and command contracts should remain stable.
- Existing non-JSON workflows should require no updates.

---

## 7) Implementation boundaries

Out of scope for this phase:

- No scanner rewrite.
- No SARIF in this phase.
- No dashboard implementation.
- No auto-fix behavior.
- No AI summarization layer.
- No new dependencies unless strongly justified.

---

## 8) Test-first plan

- Add `tests/test_validate_spec_json.py`.
- Add `tests/test_check_context_json.py` (or carefully extend existing tests).
- Parse JSON output with Python `json` module.
- Cover:
  - valid case
  - invalid case
  - error/usage case
- Assert exit codes remain exactly `0/1/2` as current behavior.

---

## 9) Future extensions

Later phases may add:

- JSON output for `audit`
- SARIF output for `audit`
- Baseline support
- Rule explanation docs
- Dashboard/reporting integration

---

## 10) Recommended implementation order

- **Phase JSON.0**: planning doc (this file)
- **Phase JSON.1**: `check-context --json`
- **Phase JSON.2**: `validate-spec --json`
- **Phase JSON.3**: `validate-spec --context-pack --json`
- **Phase JSON.4**: CI test coverage for JSON mode
- **Phase JSON.5**: later `audit` JSON/SARIF work

---

## Risks to watch

- Contract drift if JSON shape evolves without versioning.
- Duplicated finding schemas between validators.
- Regression risk if `--json` touches exit-path logic.
- Ambiguity between `invalid` vs `error` states if not consistently defined.

---

## Recommended next task

Implement **Phase JSON.1** only:

- Add `--json` to `check-context` first.
- Add focused tests to lock output shape + exit codes.
- Keep change small before extending to `validate-spec`.

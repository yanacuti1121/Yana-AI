# AUDIT JSON Output Plan

**Status date:** 2026-05-27  
**Scope:** Plan-only (no runtime implementation)

---

## 1) Current state

- `yana-ai audit` currently provides human-readable terminal output by default.
- `validate-spec` and `check-context` already support `--json` with schema-backed contract checks.
- Validator JSON contract now has:
  - schema file: `.yana-ai/schemas/validator-output.schema.json`
  - regression test: `tests/test_validator_json_schema.py`
  - CI coverage for that test.
- Audit path already supports structured-like outputs in other formats (`--markdown`, `--sarif`), but no stable, documented `--json` contract is yet locked similarly to validator commands.

---

## 2) Why `audit --json` is needed

- Enable machine-readable consumption for:
  - CI policies
  - downstream automation
  - dashboards/analytics pipelines
- Reduce brittle parsing of human output.
- Align audit behavior with validator tooling consistency (`validate-spec --json`, `check-context --json`).
- Prepare for future artifact pipelines without requiring SARIF in every integration.

---

## 3) Minimal JSON output contract

Proposed top-level fields for `yana-ai audit --json`:

- `schema_version`
- `tool`
- `command`
- `status`
- `exit_code`
- `target`
- `score`
- `risk_level`
- `summary`
- `findings`

Proposed status semantics:

- `ok` (no findings that trigger failure criteria)
- `findings` (findings exist; may or may not fail depending on options)
- `error` (usage/internal/dependency/runtime issue)

Exit code must preserve existing behavior contract used by audit command.

---

## 4) Proposed field schema

### Top-level

```json
{
  "schema_version": "1.0",
  "tool": "yana-ai",
  "command": "audit",
  "status": "ok | findings | error",
  "exit_code": 0,
  "target": "/abs/or/input/path",
  "score": 44,
  "risk_level": "HIGH",
  "summary": {
    "total_findings": 20,
    "by_severity": {
      "critical": 0,
      "high": 1,
      "medium": 15,
      "low": 4
    }
  },
  "findings": []
}
```

### Finding object (minimal)

- `id` (string)
- `severity` (string)
- `message` (string)
- `file` (string, optional)
- `line` (integer, optional)
- `rule` (string, optional)
- `fix` (string, optional)

Allow additional properties initially for forward compatibility.

---

## 5) Example output JSON (success/failure)

### Example A: success-like run (`status=ok`)

```json
{
  "schema_version": "1.0",
  "tool": "yana-ai",
  "command": "audit",
  "status": "ok",
  "exit_code": 0,
  "target": ".",
  "score": 100,
  "risk_level": "LOW",
  "summary": {
    "total_findings": 0,
    "by_severity": {
      "critical": 0,
      "high": 0,
      "medium": 0,
      "low": 0
    }
  },
  "findings": []
}
```

### Example B: findings present (`status=findings`)

```json
{
  "schema_version": "1.0",
  "tool": "yana-ai",
  "command": "audit",
  "status": "findings",
  "exit_code": 1,
  "target": ".",
  "score": 44,
  "risk_level": "HIGH",
  "summary": {
    "total_findings": 20,
    "by_severity": {
      "critical": 0,
      "high": 1,
      "medium": 15,
      "low": 4
    }
  },
  "findings": [
    {
      "id": "CI006",
      "severity": "medium",
      "message": "Third-party action used without pinned SHA",
      "file": ".github/workflows/ci.yml",
      "line": 16
    }
  ]
}
```

### Example C: runtime/internal error (`status=error`)

```json
{
  "schema_version": "1.0",
  "tool": "yana-ai",
  "command": "audit",
  "status": "error",
  "exit_code": 2,
  "target": ".",
  "score": null,
  "risk_level": null,
  "summary": {
    "total_findings": 0,
    "by_severity": {
      "critical": 0,
      "high": 0,
      "medium": 0,
      "low": 0
    }
  },
  "findings": [
    {
      "id": "AUDIT_ERROR",
      "severity": "high",
      "message": "Scanner rules unavailable"
    }
  ]
}
```

---

## 6) Validation / test plan

1. Add schema file (future phase):
   - `.yana-ai/schemas/audit-output.schema.json`
2. Add test file (future phase):
   - `tests/test_audit_json_schema.py`
3. Test cases:
   - parseable JSON output
   - required top-level fields exist
   - findings shape validation
   - exit-code consistency across modes
4. CI behavior:
   - use `jsonschema` if available
   - allow local fallback structural checks
   - fail clearly in CI if required schema-validation dependency missing

---

## 7) Small-phase rollout

- **Phase A0 (this doc):** planning only.
- **Phase A1:** implement `audit --json` minimal output path.
- **Phase A2:** add `audit-output.schema.json`.
- **Phase A3:** add `tests/test_audit_json_schema.py`.
- **Phase A4:** wire schema test into CI.
- **Phase A5:** optional enrichments (analytics fields, compatibility notes).

Keep each phase independently reviewable.

---

## 8) Risks + cutoff rule

### Risks

- Contract drift if output evolves without schema/test updates.
- Mixing human/log text into JSON mode output (breaks parsers).
- Accidental behavior changes in existing audit exit-code logic.

### Cutoff rule

Stop implementation immediately if either occurs:

1. JSON mode requires changing scanner core logic broadly (scope creep), or
2. Existing human-readable/default audit behavior changes unexpectedly.

If triggered, rollback to prior stable behavior and continue with a narrower patch.

---

## 9) Definition of done

`audit --json` milestone is done when all conditions are true:

1. `bash bin/yana-ai audit . --json` emits valid JSON only.
2. Exit codes remain compatible with existing audit semantics.
3. `audit-output.schema.json` exists and validates emitted payloads.
4. Regression test covers success/findings/error shapes.
5. CI runs and passes the new schema test.
6. Default non-JSON audit output remains unchanged.

# Auditor MVP Checkpoint

**Status date:** 2026-05-27  
**Scope:** Auditor MVP foundation + Phase 1A Spec Validator skeleton

---

## 1) Current status

- Auditor runs with **compiled JSON fallback** when `PyYAML` is unavailable.
- `.yamtamignore` filters demo/test fixture noise from root audit runs.
- `validate-spec` command skeleton exists and is callable via CLI.
- CI includes core guard checks for:
  - scanner rule drift (`compile_scanner_rules.py --check`)
  - schema/example validation
  - `.yamtamignore` regression
  - `validate-spec` regression

---

## 2) Verified commands

- `python3 tests/test_harness_schema_examples.py`
- `python3 tests/test_yamtamignore.py`
- `python3 tests/test_validate_spec.py`
- `bash bin/yamtam audit .`
- `bash bin/yamtam validate-spec examples/specs/valid-task-spec.json`

---

## 3) Known behavior

- `bash bin/yamtam audit .` may exit with code `1` when findings exist (this is expected scanner behavior, not a crash).
- Local schema validation may run in fallback mode if `jsonschema` is unavailable.
- CI is expected to enforce stricter validation paths when dependencies install successfully.

---

## 4) Known limitations

- `validate-spec` does not expose JSON output yet (human-readable only).
- Context-pack consistency checks are not implemented yet.
- `.yamtamignore` supports simple glob matching only.
- Compiled scanner JSON can drift from YAML if CI drift check is bypassed.
- Audit scoring/severity thresholds may still need practical tuning.

---

## 5) Next phase

- **Phase 1B:** context-pack check.
- Later: JSON output mode for `validate-spec`.
- Later: SARIF-oriented expansion for broader code scanning integration.
- Later: baseline profile and `.yamtamignore` expansion strategy.

---

## 6) Product positioning

- **Public:** YAMTAM Agent Auditor.
- **Internal:** Harness Scaling / Control Layer.
- Do not market the system as “12 layers”.

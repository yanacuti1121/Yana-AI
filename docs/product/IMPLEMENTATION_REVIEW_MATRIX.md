# IMPLEMENTATION REVIEW MATRIX

## 1) Current checkpoint

- Branch: `work`
- HEAD hash: `dc29dad`
- Commit message: `Add spec/context validators, context-pack checker, JSON validator contract, scanner compile/check, and CI/test wiring`
- Working tree state at review start: clean

---

## 2) File group matrix

### A. Runtime / scripts

**Primary files**
- `bin/yamtam`
- `core/scripts/audit_scanner.py`
- `core/scripts/validate_spec.py`
- `core/scripts/check_context_pack.py`
- `core/scripts/compile_scanner_rules.py`

**Change intent**
- Add CLI routes for `validate-spec` and `check-context`.
- Add JSON output mode for validator commands.
- Add context-pack validation flow and spec validation flow.
- Add scanner compiled-rule fallback and drift-check utility.

**Risk**
- `audit_scanner.py` has high logic density and broad responsibility.
- Cross-script coupling (e.g., spec validator reusing context checker) can create hidden side effects.
- Behavioral drift risk between human-readable output and JSON output paths.

**Current test coverage**
- `tests/test_validate_spec.py`
- `tests/test_context_pack_check.py`
- `tests/test_audit_json_mvp.py`
- `tests/test_yamtamignore.py`

**Coverage gaps**
- Limited direct invariants for textual/human output contract stability.
- No dedicated "change detector" test to guard `audit_scanner.py` complexity regressions by subsystem.

---

### B. Schemas / scanner data

**Primary files**
- `.yamtam/schemas/spec.schema.json`
- `.yamtam/schemas/run-log.schema.json`
- `.yamtam/schemas/validator-output.schema.json`
- `.yamtam/schemas/examples/*`
- `scanner/compiled/*.json`

**Change intent**
- Define schema contracts for spec/run-log/validator outputs.
- Provide fixtures/examples to make contracts executable.
- Support runtime scanning without PyYAML via compiled scanner JSON.

**Risk**
- Contract drift between schema and examples.
- Drift between source YAML scanner rules and compiled JSON fallback rules.
- Soft compatibility ambiguity if additive schema changes are undocumented.

**Current test coverage**
- `tests/test_harness_schema_examples.py`
- `tests/test_validator_json_schema.py`
- `core/scripts/compile_scanner_rules.py --check` (CI step)

**Coverage gaps**
- No single consolidated contract matrix file tracking version policy across schemas.
- No dedicated test for strict non-drift of human-readable vs JSON semantic status mapping.

---

### C. Tests

**Primary files**
- `tests/test_harness_schema_examples.py`
- `tests/test_yamtamignore.py`
- `tests/test_validate_spec.py`
- `tests/test_context_pack_check.py`
- `tests/test_validator_json_schema.py`
- `tests/test_audit_json_mvp.py`

**Change intent**
- Protect validator correctness and contract stability.
- Verify fallback behavior in dependency-restricted environments.
- Verify ignore behavior and CLI exit semantics.

**Risk**
- Some checks rely on fallback mode locally; strict behavior depends on CI dependency availability.
- Coverage is split across many tests; failure diagnosis can be slower without grouped smoke markers.

**Current test coverage**
- Good breadth across spec/context/validator-json/audit-json MVP and ignore behavior.

**Coverage gaps**
- Missing compact “must-pass quick suite” command that teams can run before every large task.

---

### D. Docs / plans / policies / examples

**Primary files**
- `docs/product/*` (checkpoint + roadmap plans)
- `docs/architecture/*`
- `.yamtam/policies/*`
- `.yamtam/context-packs/README.md`
- `examples/context-packs/*`
- `examples/specs/*`

**Change intent**
- Document internal harness scaling decisions and phased implementation strategy.
- Provide fixtures for validator behavior and governance checks.

**Risk**
- Documentation sprawl: overlapping checkpoint/plan docs can diverge.
- Policy/example drift if runtime behavior changes faster than docs updates.

**Current test coverage**
- Fixture-driven tests indirectly cover many examples and schema assumptions.

**Coverage gaps**
- No doc-index map indicating source-of-truth doc per topic.

---

## 3) Risk register (top 3)

1. **Commit too large**
   - One large integration commit (68 files) reduces auditability and incremental trace clarity.

2. **`audit_scanner.py` complexity concentration**
   - Single script carries multiple responsibilities (match engines, path resolution, output modes, ignore behavior).

3. **Docs/schema/contract drift**
   - Multiple plans/checkpoints/schemas can desynchronize without strict update discipline.

---

## 4) Minimal smoke suite (5–7 quick commands)

Run these before any large follow-up task:

1. `python3 tests/test_harness_schema_examples.py`
2. `python3 tests/test_validator_json_schema.py`
3. `python3 tests/test_validate_spec.py`
4. `python3 tests/test_context_pack_check.py`
5. `python3 tests/test_yamtamignore.py`
6. `python3 -m pytest tests/test_audit_json_mvp.py`
7. `bash bin/yamtam audit . --json >/tmp/yamtam-audit.json && python3 -m json.tool /tmp/yamtam-audit.json >/dev/null`

---

## 5) Next phase recommendation

- **Immediate mode:** plan-only follow-up (no runtime changes).
- **After that:** test-only hardening pass (focus on grouped smoke and contract invariants).
- **Runtime change:** only after plan/test stabilization, and in minimal slices.

Recommended sequence:
1. Plan-only: doc index + contract ownership map.
2. Test-only: smoke suite standardization and failure triage notes.
3. Runtime changes last: smallest possible patch per feature.

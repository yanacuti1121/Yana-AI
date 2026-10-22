# Yana AI Layer Model (Source of Truth)

## 1. Purpose

Yana AI uses an **interleaved layer model**.

This is **not** a linear numbering model like `L1 -> L9`.

- Base layers are core guard layers.
- Interleaved layers (`.5`) are reinforcement layers inserted between base layers.

## 2. Layer naming rule

### Base Layers
- `L1`
- `L2`
- `L3`
- `L4`
- `L5`

### Interleaved Layers
- `L1.5`
- `L2.5`
- `L3.5`
- `L4.5`
- `L5.5`

### Naming constraints
- Do **not** introduce `L6/L7/L8` unless architecture is formally changed.
- `L5.5` is the top reinforcement layer in the current model; it is **not** `L6`.

### Formal change record
- **L6 — Cognitive Reliability Layer** was formally added on 2026-06-12 via
  `docs/adr/ADR-006-cognitive-reliability-layer.md` + `core/rules/69-cognitive-reliability-law.md`.
  L6 sits **outside** the interleaved execution stack above: it gates agent
  *reports and decisions* (completion claims, evidence, scope, bias), not a
  command pipeline stage. The L1–L5.5 execution model is unchanged.
  Enforcement: behavioral (rule 69); automated gate tooling not yet implemented.

## 3. Meaning

- `Lx` = base guard checkpoint.
- `Lx.5` = reinforcement layer between two base checkpoints.
- `L5.5` = top hardening/operator reinforcement layer.

## 4. Current suggested map

| Layer | Type | Role | Current command/file evidence | Status |
|---|---|---|---|---|
| L1 Spec Guard | Base | Validate task spec structure before execution | `bash bin/yana-ai validate-spec <spec-file>`; `core/scripts/validate_spec.py`; `tests/test_validate_spec.py` | PASS |
| L1.5 Validation/Contract Guard | Interleaved | Validate validator JSON output contract/schema | `.yana-ai/schemas/validator-output.schema.json`; `tests/test_validator_json_schema.py` | PASS |
| L2 Context Pack Guard | Base | Constrain scope with context-pack checks | `bash bin/yana-ai check-context <context-pack-dir>`; `core/scripts/check_context_pack.py`; `tests/test_context_pack_check.py` | PASS |
| L2.5 Smoke/Truth Prep | Interleaved | Pre-flight smoke readiness before major runs | `docs/product/IMPLEMENTATION_REVIEW_MATRIX.md` (guidance only) | PLANNED |
| L3 Smoke/Truth Gate | Base | Evidence-based pass/fail operator flow | `tests/test_yana-aiignore.py`; `tests/test_audit_json_mvp.py`; `tests/test_harness_schema_examples.py` (partial) | UNKNOWN |
| L3.5 Prompt Injection Guard | Interleaved | Prompt/input hardening between truth and scanner gates | No dedicated command/test in current scope | PLANNED |
| L4 Audit Scanner Gate | Base | Risk scanning and policy findings | `bash bin/yana-ai audit .`; `core/scripts/audit_scanner.py`; `scanner/compiled/*.json`; `tests/test_audit_json_mvp.py` | PASS |
| L4.5 Supply Chain/Dependency Guard | Interleaved | Dependency/runtime hardening checks | `requirements-dev.txt`; `.github/workflows/ci.yml` install/check steps (partial) | UNKNOWN |
| L5 Release/Backup Gate | Base | Preserve restorable state before risky transitions | Git bundle/checksum operational workflow (operator evidence) | UNKNOWN |
| L5.5 Final Hardening/Operator Gate | Interleaved | Final operator discipline and rollout cutoff control | No single enforced command/test in current scope | PLANNED |

## 5. Rules for future docs

1. Use **Base Layers** and **Interleaved Layers** naming.
2. Do not describe `L1.5/L2.5/...` as independent replacement stacks.
3. Do not mark layer `PASS` without command/test/file evidence.
4. Do not add layers without all three:
   - explicit role,
   - command/test evidence target,
   - pass/fail criteria.

## 6. Next step

After this source-of-truth file, prioritize locking **L3 Smoke/Truth Gate** with explicit, repeatable command evidence.

Do **not** open large Rust/Docker/CI expansions before L3 evidence discipline is stable.

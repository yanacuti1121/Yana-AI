# RUST MIGRATION PLAN (Plan-Only)

## 1. Why Rust

Rust is a strong long-term fit for Yana AI CLI tools because:
- fast startup for short-lived commands,
- single native binary distribution,
- strict typing for output contracts and exit codes,
- memory safety by default.

## 2. Why not migrate everything now

A full migration now would expand scope too quickly:
- new Cargo workspace and release path,
- binary routing and fallback behavior,
- CI build matrix changes,
- cross-platform packaging issues,
- risk of output contract drift.

Current priority is controlled migration with minimal operational risk.

## 3. First candidate: `check-context` or `audit`

Recommended first candidate: `check-context`.

Why:
- smaller, rule-based logic,
- lower blast radius,
- existing fixture coverage is already good,
- easy parity checks for exit codes + JSON output.

`audit` should be migrated later due to higher complexity.

## 4. CLI contract to preserve

Rust path must preserve current command behavior:
- `bash bin/yana-ai check-context <context-pack-dir>`
- Exit codes stay:
  - `0` valid
  - `1` invalid
  - `2` usage/internal error
- Default human-readable output remains stable.

## 5. JSON contract to preserve

Rust path must preserve existing JSON contract semantics:
- clean JSON on stdout,
- no mixed logs in JSON output,
- unchanged status/exit semantics,
- compatibility with existing validator JSON tests/schema.

## 6. Python fallback strategy

Dual-path rollout:
1. Prefer Rust binary when available and healthy.
2. Fallback to Python implementation if Rust is unavailable.
3. Return exit code `2` with clear error if both fail.

Fallback remains until parity is proven in CI.

## 7. Test plan

Before defaulting to Rust, enforce parity tests:
- valid context pack,
- invalid context pack,
- missing path,
- JSON parseability + required fields,
- exit-code parity with Python.

Keep tests dependency-light.

## 8. CI rollout plan

Phased CI rollout:
1. Add optional Rust build job (non-blocking).
2. Add parity tests for Rust artifact (initially non-blocking).
3. Promote parity checks to required once stable.
4. Keep Python fallback for multiple green cycles.

## 9. Risk and cutoff rule

Key risks:
- output contract drift,
- edge-case behavior mismatches,
- CI flakiness from new build steps,
- operational overhead.

Cutoff rule:
Stop rollout/default switch if any of these occurs:
- exit-code mismatch,
- JSON contract mismatch,
- repeated flaky failures,
- reliability worse than Python baseline.

## 10. Smallest future coding phase

Phase R0 (smallest possible):
- implement Rust PoC for `check-context` only,
- keep Python unchanged,
- add opt-in invocation path (no default switch),
- add parity tests.

Success criteria:
- existing tests remain green,
- parity tests pass,
- no CLI contract break,
- no forced dependency burden for users.

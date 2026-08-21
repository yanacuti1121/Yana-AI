# Mojo Vector Recall Pilot — Technical Findings and Handoff

**Date:** 2026-08-21
**Branch:** `codex/mojo-vector-recall-pilot`
**Base:** `origin/main` at `7b61bcbb`
**Status:** Experimental, opt-in, Python fallback retained
**Production default:** Python

## Executive Summary

Mojo is a plausible future compute accelerator for Yana AI, but it is not a
replacement for `yana-rt`, the Python hook layer, or any governance path.

The pilot adds one deliberately narrow boundary: Python sends one query vector
and a batch of candidate vectors to an optional Mojo module, and Mojo returns
one cosine-similarity score for each candidate. Python continues to own:

- embedding requests;
- secret redaction;
- lock and cache consistency;
- minimum-similarity filtering;
- Top-K selection;
- result formatting;
- all failure handling.

The default path remains Python. Mojo is attempted only when
`YANA_MEMORY_VECTOR_BACKEND=mojo` or `auto` is set. Missing tooling, compiler or
import failures, Python-level exceptions, malformed result lengths, and
non-finite scores all fall back to the reference Python implementation. Native
process aborts are not catchable by Python and require isolated validation.

This is the correct shape for an experiment because it measures Mojo where the
language is strongest—bounded numerical work—without moving authority or
policy out of Yana's established Rust and Python layers.

## What We Found

### 1. The cleanest candidate is embedding recall

`core/lib/hermes_adapted/memory_manager_io.py` currently obtains embeddings
from the configured local endpoint, keeps a JSONL cache, and scans cached
vectors using a pure-Python cosine implementation. The file documents an upper
bound of roughly 1.5 million multiply-adds for one 2,000-entry scan at 768
dimensions.

That loop is:

- numerical;
- deterministic;
- free of filesystem or network side effects;
- easy to compare against a reference implementation;
- outside the security decision boundary.

These properties make it safer than experimenting in governance, capability,
locking, OS supervision, or command execution.

### 2. Current scale does not yet prove Mojo is necessary

The realistic Python reference benchmark used by this pilot:

```text
shape=2000x768 iterations=5
python=0.404418s selected=0.400600s speedup=1.01x
```

This result shows that routing through the new dispatcher does not introduce a
measurable regression on the default Python path. It does **not** demonstrate a
Mojo speedup, because the Mojo compiler could not execute successfully on the
current host.

At Yana's present recall scale, pure Python may already be sufficient. Mojo
should become the default only after representative workloads show a material,
repeatable improvement—not because an accelerator exists.

### 3. Mojo belongs in the data plane, not the control plane

The architecture decision from this pilot is:

```text
Rust yana-rt
  governance · capability · OS control · process safety
                │
                ▼
Python memory adapter
  I/O · redaction · cache · thresholds · Top-K · fallback
                │
                ▼
Optional Mojo kernel
  batch cosine scores only
```

Do not move the following into Mojo as part of this work:

- authorization or autonomy decisions;
- hook execution or shell-command handling;
- lock ownership or state-file mutation;
- local model/provider routing;
- CPU/GPU telemetry collection;
- desktop or terminal UI logic.

Those paths already have stronger ownership and portability in Rust, Python,
or the existing UI stacks.

### 4. Mojo 1.0 toolchain validation is blocked on this host

The isolated validation environment contained:

```text
Mojo 1.0.0 (ed45d567)
Python 3.14.6
arm64
macOS 27.0
```

The compiler exited with status `133` and printed its crash stack while trying
to compile both:

- `yana_mojo_vector_recall.mojo`;
- a minimal `hello.mojo` containing only `print("hello")`.

A minimal Python-extension module failed in the same way. Therefore the
current evidence points to a local toolchain/platform compatibility problem,
not a source-specific failure. However, the Mojo source remains **uncompiled
and unverified** until it succeeds on another supported host.

No Linux environment or container runtime was available locally. Linux is not
claimed passing.

## Implementation

### Python dispatcher

`core/lib/hermes_adapted/mojo_vector_recall.py`

- contains the canonical Python cosine reference;
- lazily loads `mojo.importer` only when explicitly requested;
- invokes Mojo once for the whole candidate batch;
- validates output count and finiteness;
- records backend status for diagnostics;
- permanently falls back within the process after a Mojo failure;
- leaves the default path free of vector-copy overhead.

### Mojo kernel

`core/lib/hermes_adapted/mojo/yana_mojo_vector_recall.mojo`

- exposes one Python-callable function: `cosine_scores`;
- accepts the original Python query and candidate lists;
- computes dot products and vector norms;
- returns one score per input candidate;
- returns `0.0` for empty or dimension-mismatched vectors;
- has no filesystem, network, subprocess, policy, or cache access.

### Memory recall integration

`core/lib/hermes_adapted/memory_manager_io.py`

- collects cache-backed candidate vectors;
- sends them through one batch scoring call;
- keeps threshold filtering, sorting, Top-K, and output formatting in Python.

### Benchmark and documentation

`core/lib/hermes_adapted/mojo/benchmark.py` compares selected-backend output
against the Python reference before reporting timing. It exits non-zero when:

- scores diverge;
- output length differs;
- Mojo is explicitly requested but unavailable.

`core/lib/hermes_adapted/mojo/README.md` documents opt-in usage and the
benchmark command.

### Linux hard-failure probe

`core/lib/hermes_adapted/mojo/integration_probe.py` imports and calls the real
extension in separate child processes. It distinguishes a catchable Python
exception from a native signal or abort for:

- non-numeric vector elements;
- an invalid candidate shape;
- dimension mismatch, which intentionally keeps the existing `0.0` contract.

The parent survives a child crash and reports the child's return code, stdout,
and stderr. This answers the pilot's most important safety question without
letting a hard compiler/runtime failure terminate the entire CI test runner.

## Behavior Contract

The following contract must remain true if this pilot is extended:

1. Python is the default backend.
2. Mojo is optional and explicitly requested.
3. Mojo never owns policy or persistent state.
4. One candidate input produces exactly one score output.
5. Invalid Mojo results cannot reach recall ranking.
6. Failure falls back without losing the user's recall request.
7. Existing recall thresholds and Top-K semantics do not change.
8. No Mojo package is required for npm, PyPI, desktop, or normal hook use.

## Verification Evidence

### Python and Hermes tests

```text
202 passed in 0.15s
```

The memory-manager subset reports:

```text
34 passed in 0.06s
```

New coverage includes:

- batch Python output matches the scalar reference;
- all candidates cross a fake Mojo boundary in one call;
- invalid or non-finite Mojo output falls back;
- a Mojo backend that raises during execution falls back and records the error;
- explicitly requesting Mojo without an importable runtime falls back;
- existing recall ranking, redaction, cache, and rate-limit tests remain green.

### Repository gates

```text
py_compile: 0
git diff --check: 0
core-lock: 282 ok · 0 drift · 0 missing · 0 extra
drift-check: CLEAN
```

### Hook suite

The full suite completed with:

```text
Total tests: 342
Passed: 341
Failed: 1
```

All five `memory-recall-prompt.sh` tests passed when the suite ran with local
loopback permission. The remaining failure was:

```text
race [10x budget-sentinel + 10x token-budget-guard on the same file,
zero lost updates]
loop_attempts.RaceTool2=8, expected 10
```

That failure is outside the files changed by this pilot. A newer parallel
workstream is reported to have fixed the ADR-008 race; this branch has not yet
been rebased onto or verified against that newer change. The observation above
is retained as historical test evidence, not listed as open Mojo debt.

## Exact Commands

Python-only verification:

```bash
PYTHONPATH="$PWD" python3 -m pytest -q tests/test_hermes_*.py
python3 -m py_compile \
  core/lib/hermes_adapted/mojo_vector_recall.py \
  core/lib/hermes_adapted/mojo/benchmark.py \
  core/lib/hermes_adapted/mojo/integration_probe.py \
  tests/test_hermes_memory_manager_io.py
git diff --check
bash core/scripts/verify-core-lock.sh
bash core/scripts/drift-check.sh
```

Reference benchmark:

```bash
PYTHONPATH="$PWD" python3 \
  -m core.lib.hermes_adapted.mojo.benchmark \
  --backend python --entries 2000 --dimensions 768 --iterations 5
```

Mojo validation on a compatible host:

```bash
uv venv
uv pip install mojo pytest
PYTHONPATH="$PWD" python \
  core/lib/hermes_adapted/mojo/integration_probe.py
PYTHONPATH="$PWD" python \
  -m core.lib.hermes_adapted.mojo.benchmark \
  --backend mojo --entries 2000 --dimensions 768 --iterations 5
```

## Production Acceptance Criteria

Do not enable Mojo by default until all items below have evidence:

- [ ] `hello.mojo` and the extension module compile on Ubuntu 22.04+.
- [ ] Invalid element types and candidate shapes raise Python exceptions rather
      than aborting the host process.
- [ ] The extension compiles on the supported Apple-silicon macOS baseline.
- [ ] Mojo scores match Python within `1e-9` across random, zero, mismatched,
      negative, and large-magnitude vectors.
- [ ] Benchmark matrix covers 500, 2,000, and 10,000 candidates at 384, 768,
      and 1,536 dimensions.
- [ ] Median warm-call speedup is at least `2x` on a representative workload.
- [ ] Cold-import/compile cost is measured separately from warm-call cost.
- [ ] Peak memory does not materially regress.
- [ ] npm and PyPI artifacts still work without Mojo installed.
- [ ] macOS and Linux fallback behavior is exercised in CI.
- [ ] Windows behavior is explicitly documented; native Windows support must
      not be implied by a WSL-only result.

If the speed threshold is not met, keep the code experimental or remove it.
The existence of a working kernel is not sufficient reason to add production
dependency and packaging cost.

## Handoff for Claude and Codex

When continuing this work:

1. Start from this report and the branch diff; do not redesign the boundary.
2. First obtain a successful Linux compile of the existing Mojo source.
3. If the source has syntax/API drift, change only the Mojo module and its
   integration tests; do not weaken Python fallback behavior.
4. Run the correctness matrix before performance measurement.
5. Record cold and warm timings separately.
6. Do not make Mojo automatic until the production acceptance criteria pass.
7. Do not replace Rust governance, capability, OS, or process-control code.
8. Rebase before final verification so the parallel ADR-008 fix is included;
   do not duplicate or alter locking code in this pilot.

## Decision

**Keep the pilot, keep it opt-in, and validate on Linux next.**

The architecture is useful because it creates a safe accelerator seam with a
reference implementation and observable fallback. The performance case for
shipping Mojo as a default dependency is not yet proven.

## Official Mojo References

- [Mojo manual](https://docs.modular.com/mojo/manual/)
- [System requirements](https://docs.modular.com/mojo/requirements/)
- [Calling Mojo from Python](https://docs.modular.com/mojo/manual/python/mojo-from-python/)
- [Mojo installation](https://docs.modular.com/mojo/manual/install/)

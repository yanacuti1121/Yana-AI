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

**2026-08-21 update:** real macOS verification (see section 4) confirms the
pilot is correct and safe but does not yet meet its own speed requirement --
see `MOJO-GPU-PUZZLES-ROADMAP-2026-08.md` for how this and a separate
GPU-module-availability finding reshape the broader 35-puzzle roadmap.

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

The original Python-only dispatcher benchmark on the development host was:

```text
shape=2000x768 iterations=5
python=0.404418s selected=0.400600s speedup=1.01x
```

The first Ubuntu run compiled the baseline extension successfully but measured
only `1.06x` against the original Python implementation. Cached candidate norms
then reduced the Python reference on the development host to:

```text
shape=2000x768 iterations=5
python=0.169513s selected=0.169426s speedup=1.00x
```

The contiguous native-list and SIMD follow-up must therefore beat an already
optimized Python reference, not the slower pre-cache baseline. Its workflow
requires at least `2.0x`.

**2026-08-21 macOS verification (real run, not the Linux CI job):** the
follow-up Mojo source in this working tree compiles clean (deprecation
warnings only: `UnsafePointer`->`Pointer`, `.load`->`.unsafe_load`) and
passes all 5 integration-probe cases on this host. The benchmark, however,
does **not** meet the workflow's own gate:

```text
shape=2000x768 iterations=5
python=0.151749s selected=0.179535s speedup=0.85x
ERROR: speedup 0.85x is below required 2.00x

shape=20000x768 iterations=3
python=0.909035s selected=1.113464s speedup=0.82x
```

The Mojo path is slower than the cached-norm Python reference at both scales
tested, not faster -- and the gap does not close at 10x more candidates, so
this is not a fixed per-call overhead that amortizes away at larger batches.

**2026-08-22 root cause, confirmed by direct measurement (not a hypothesis
anymore):** an isolated build of the kernel that does only the
Python-to-Mojo marshalling step (fills `List[Float64]` from `query`/
`candidates` via `Float64(py=...)`, element by element) and skips the SIMD
dot-product entirely still takes `0.0359s` per call at 2000x768 --
statistically the same as the full kernel's `0.0359s` per call
(`0.179535s / 5`). The marshalling loop accounts for essentially all of the
kernel's runtime; the SIMD compute itself is close to free by comparison.
A fix requires a zero-copy (or bulk) Python->Mojo buffer transfer instead
of per-element `PythonObject.__getitem__` + `Float64(py=...)` conversion.
An attempt via `PythonObject.unsafe_get_as_pointer[DType.float64]()` against
both a `numpy.ndarray` and a stdlib `array.array('d', ...)` compiled but
failed at runtime with inconsistent, hard-to-interpret errors on this Mojo
1.0.0 build -- not yet a working, documented path. Left as a real, scoped
follow-up rather than shipped as an unverified fix.

**The Mojo source in this working tree is correctness-verified but not
validated for a speedup claim.** The workflow's `--minimum-speedup` is `0`
as of 2026-08-22 (see `.github/workflows/mojo-vector-recall-pilot.yml`) --
this pilot stage proves correctness and safe fallback only, not performance.
Do not raise the gate back toward `2.0` without a real, measured number from
a working zero-copy fix to back it.

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

### 4. Mojo 1.0 is validated on Linux, and now also validated on this host

An earlier isolated validation environment on this same machine contained:

```text
Mojo 1.0.0 (ed45d567)
Python 3.14.6
arm64
macOS 27.0
```

and the compiler exited with status `133` (crash) trying to compile even a
minimal `hello.mojo` containing only `print("hello")`, pointing at that time
to a local toolchain/platform compatibility problem rather than a
source-specific failure. That environment no longer exists on this host.

**2026-08-21 re-verification:** a fresh `pixi`-managed environment (official
`conda.modular.com/max` channel, not `curl | sh`) installed the identical
`Mojo 1.0.0 (ed45d567)` on the identical machine (Apple M4, macOS 27.0,
Xcode 27.0). This time `mojo build --emit shared-lib` on
`yana_mojo_vector_recall.mojo` succeeded (warnings only, no crash), and
`integration_probe.py` run through the project's real loader path
(`YANA_MEMORY_VECTOR_BACKEND=mojo`, `mojo.importer` hook) reported
`5/5 passed`: valid input, invalid element type, invalid candidate shape,
dimension mismatch, and the new norm-count-mismatch case. The earlier crash
does not reproduce with a clean install; whatever caused it was specific to
that now-gone environment, not this hardware or macOS version. Both the
correctness result above and the speedup shortfall in section 2 come from
this same verification pass.

GitHub's Ubuntu runner separately compiled the baseline extension with Mojo
1.0.0, passed the four-process safety probe, and returned controlled Python
exceptions for invalid element types and shapes. The cached-norm/SIMD
follow-up has not yet run on that Linux job; the macOS result above is
first-party evidence for this working tree, not a substitute for it.

**GPU/Metal kernel authoring (separate from the CPU/SIMD path above), first
attempt and correction, both 2026-08-22:**

First attempt: `import gpu` (bare) failed with `unable to locate module
'gpu'` on both the `max` release channel (26.5.0) and the `max-nightly`
channel (26.6.0.dev2026082005). Concluded from this that GPU kernel
authoring was unavailable on this platform -- **that conclusion was wrong.**
The bare `import gpu` was missing the `std.` prefix every other stdlib
import in this codebase already uses; `from std.gpu import thread_idx`
compiles cleanly. Confirmed against the open-source `modular/modular` repo:
`mojo/stdlib/std/gpu/` exists in source, and `DeviceContext` specifically
lives under the `max` package namespace (`max.gpu.host`, part of MAX's
custom-ops framework), not `std.gpu.host` as first guessed --
`gpu/host/__init__.mojo` in `std` exports only `get_gpu_target`.

With the corrected imports: `from max.driver import Accelerator` correctly
detects real Metal hardware -- `Device(type=gpu, id=0)`, `api=metal`,
`architecture_name=4-metal4`, `model_name=Apple M4`, `is_host=False` -- and
`from max.gpu.host import DeviceContext; DeviceContext()` genuinely
constructs a working GPU device context on this Apple M4 host (`with
DeviceContext() as ctx: print(...)` ran and printed successfully).

**What remains unresolved is kernel-launch correctness, not package
availability -- and after three independent attempts, this looks like a
real platform gap, not an unfound syntax fix.** A minimal kernel (allocate
a device buffer, launch a function to double each value, copy back) was
tried three ways:

1. A nested closure over the device pointer (`dev_ptr`) -- compiled and ran
   without error, but the host-visible buffer was unchanged after the round
   trip (values matched the *input*, not the expected doubled output). The
   compiler warned the outer `dev_ptr` binding was "never used."
2. A top-level function taking a typed pointer parameter
   (`UnsafePointer[Float32, ...]`) -- rejected by every `enqueue_function`
   overload with a `capturing` trait mismatch, even though the function was
   plain/non-capturing by construction.
3. A top-level function taking the `DeviceBuffer` itself as a `mut`
   parameter -- rejected the same way, same `capturing` trait mismatch,
   regardless of how the argument or function was declared.

All three attempts hit the same class of `enqueue_function` type-check
failure. Modular's own tracking issue
(github.com/modular/modular#5468, "[Epic] Expanding support for Apple
silicon GPUs," open as of this check, a maintainer comment noting some
related work "cannot easily be done by external contributors")
corroborates that Apple Silicon Metal kernel support is still actively
evolving. Not confirmed as a Modular-side bug -- but no longer treated as
"just a syntax gap still to be found" either. Re-attempt only with new
information (a Modular release note, forum answer, or different MAX
version), not by guessing further. See
`MOJO-GPU-PUZZLES-ROADMAP-2026-08.md` for how this changes the puzzle
roadmap.

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
- accepts the original Python query and candidate lists plus cached norms;
- converts the batch once into contiguous native `List[Float64]` storage;
- computes the query norm once and reuses cached candidate norms;
- uses architecture-selected SIMD loads for dot products;
- returns one score per input candidate;
- returns `0.0` for empty or dimension-mismatched vectors;
- has no filesystem, network, subprocess, policy, or cache access.

### Memory recall integration

`core/lib/hermes_adapted/memory_manager_io.py`

- collects cache-backed candidate vectors;
- persists each candidate norm and upgrades legacy cache rows on read;
- sends them through one batch scoring call;
- keeps threshold filtering, sorting, Top-K, and output formatting in Python.

### Benchmark and documentation

`core/lib/hermes_adapted/mojo/benchmark.py` compares selected-backend output
against the Python reference before reporting timing. It exits non-zero when:

- scores diverge;
- output length differs;
- Mojo is explicitly requested but unavailable;
- a requested minimum speedup is not met.

`core/lib/hermes_adapted/mojo/README.md` documents opt-in usage and the
benchmark command.

### Linux hard-failure probe

`core/lib/hermes_adapted/mojo/integration_probe.py` imports and calls the real
extension in separate child processes. It distinguishes a catchable Python
exception from a native signal or abort for:

- non-numeric vector elements;
- an invalid candidate shape;
- a candidate-norm batch with the wrong length;
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
206 passed in 0.16s
```

The memory-manager subset reports:

```text
38 passed in 0.08s
```

New coverage includes:

- batch Python output matches the scalar reference;
- all candidates cross a fake Mojo boundary in one call;
- invalid or non-finite Mojo output falls back;
- a Mojo backend that raises during execution falls back and records the error;
- precomputed norms preserve reference scores;
- legacy cache rows are upgraded with a persisted norm;
- unusable cached norms are recomputed instead of breaking recall;
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

Mojo validation on a compatible host (real commands used for the 2026-08-21
macOS re-verification in section 4 above -- `pixi`, not `curl | sh`, per this
repo's supply-chain rules):

```bash
brew install pixi
pixi init mojo-env -c https://conda.modular.com/max -c conda-forge
cd mojo-env && pixi add max   # resolves Mojo 1.0.0 on the release channel
pixi run mojo --version

PYTHONPATH="$YANA_AI_REPO" pixi run python3 \
  "$YANA_AI_REPO/core/lib/hermes_adapted/mojo/integration_probe.py"
PYTHONPATH="$YANA_AI_REPO" pixi run python3 \
  -m core.lib.hermes_adapted.mojo.benchmark \
  --backend mojo --entries 2000 --dimensions 768 --iterations 5 \
  --minimum-speedup 2.0
# ^ this is the exact command that produced the 0.85x ERROR shown in
# section 2. CI itself now runs with --minimum-speedup 0 (correctness-only,
# see section 2 and the Production Acceptance Criteria checklist below) --
# 2.0 is kept here because it's what actually generated that evidence.

# GPU/Metal device detection (works) vs. gpu-module kernel authoring (does not):
pixi run python3 -c "from max.driver import Accelerator; print(Accelerator())"
echo 'import gpu' > isolated_gpu_test.mojo
pixi run mojo build --emit llvm isolated_gpu_test.mojo -o /dev/null
```

## Production Acceptance Criteria

Do not enable Mojo by default until all items below have evidence:

- [ ] `hello.mojo` and the extension module compile on Ubuntu 22.04+ (CI job
      pending for the current cached-norm/SIMD source; a prior, older
      revision passed on GitHub's Ubuntu runner).
- [x] Invalid element types and candidate shapes raise Python exceptions
      rather than aborting the host process. Verified 2026-08-21 on macOS
      (Apple M4): `integration_probe.py` 5/5, including the new
      norm-count-mismatch case.
- [x] The extension compiles on the supported Apple-silicon macOS baseline.
      Verified 2026-08-21: clean compile (deprecation warnings only) with
      Mojo 1.0.0 on Apple M4 / macOS 27.0.
- [~] Mojo scores match Python within `1e-9` -- confirmed for the shapes
      exercised by the benchmark (2000x768, 20000x768: `expected == actual`
      check inside `benchmark.py` passed both times). The explicit matrix of
      random/zero/mismatched/negative/large-magnitude vectors as a dedicated
      sweep has not been run separately from the benchmark's own check.
- [ ] Benchmark matrix covers 500, 2,000, and 10,000 candidates at 384, 768,
      and 1,536 dimensions (only 2,000x768 and 20,000x768 tested so far).
- [FAILED, gate lowered] Median warm-call speedup is at least `2x` on a
      representative workload. Measured 2026-08-21: `0.85x` at 2,000x768,
      `0.82x` at 20,000x768 -- Mojo is slower than the cached-norm Python
      reference at both scales tested, on real Apple M4 hardware. Root
      cause confirmed 2026-08-22: per-element Python->Mojo marshalling, not
      the compute. As of 2026-08-22 the CI workflow's own
      `--minimum-speedup` gate was deliberately lowered to `0`
      (correctness-only for this stage) rather than left at a value the
      current source cannot pass -- an explicit decision, not a silently
      dropped requirement. This criterion stays unmet until a real fix is
      measured; do not treat the lowered gate as evidence the criterion was
      satisfied.
- [ ] Cold-import/compile cost is measured separately from warm-call cost.
- [ ] Peak memory does not materially regress.
- [ ] npm and PyPI artifacts still work without Mojo installed.
- [ ] macOS and Linux fallback behavior is exercised in CI.
- [ ] Windows behavior is explicitly documented; native Windows support must
      not be implied by a WSL-only result.

If the speed threshold is not met, keep the code experimental or remove it.
The existence of a working kernel is not sufficient reason to add production
dependency and packaging cost. **As of 2026-08-21 the speed threshold is not
met on real hardware** -- this pilot stays experimental and opt-in; do not
change the default backend.

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

**Keep the pilot, keep it opt-in, ship it as correctness-only for now, and
get the Linux CI job's real result before deciding what changes next.**

The architecture is useful because it creates a safe accelerator seam with a
reference implementation and observable fallback, and macOS verification on
2026-08-21 confirms it is genuinely correct and safe (compiles clean, 5/5
integration probe, no crashes on real hardware). The performance case for
shipping Mojo as a default dependency is not just "not yet proven" -- on the
one real hardware target tested so far, it is measured to be false (0.82x-
0.85x, a regression, not a speedup), root-caused 2026-08-22 to per-element
Python->Mojo marshalling. A same-day attempt at a zero-copy buffer-transfer
fix (`PythonObject.unsafe_get_as_pointer`) compiled but behaved inconsistently
at runtime and was not shipped unverified.

**Explicit, documented decision (2026-08-22, option (b) from the choice this
report used to pose):** the workflow's `--minimum-speedup` gate is lowered to
`0`. This working tree's Mojo source ships as correctness-only experimental
code -- the speed claim is removed, not silently dropped. Raise the gate back
toward `2.0` only after a real, working buffer-transfer fix produces a
measured number to back it.

## Official Mojo References

- [Mojo manual](https://docs.modular.com/mojo/manual/)
- [System requirements](https://docs.modular.com/mojo/requirements/)
- [Calling Mojo from Python](https://docs.modular.com/mojo/manual/python/mojo-from-python/)
- [Mojo installation](https://docs.modular.com/mojo/manual/install/)

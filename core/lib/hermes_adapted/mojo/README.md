# Optional Mojo Vector Recall Pilot

Full findings and handoff:
[`docs/reports/MOJO-VECTOR-RECALL-PILOT-2026-08.md`](../../../../docs/reports/MOJO-VECTOR-RECALL-PILOT-2026-08.md).

This directory contains an opt-in compute kernel for the embedding-recall hot
path. It is not a replacement for `yana-rt`, the Python memory provider, or
Yana's policy and safety layers.

## Boundary

- Python owns embedding I/O, redaction, cache locking, thresholds, and Top-K.
- Mojo receives one query vector plus a batch of candidate vectors.
- Mojo returns one cosine score per candidate.
- Any missing toolchain, compile/import failure, Python-level exception,
  invalid length, or non-finite result falls back to the Python reference
  implementation.
- A native abort cannot be caught by Python. The Linux integration probe runs
  extension calls in child processes so such a failure is reported explicitly.

The pilot defaults to Python. Enable it explicitly:

```bash
YANA_MEMORY_VECTOR_BACKEND=mojo python3 your_entrypoint.py
```

`auto` has the same fallback behavior but communicates that Mojo is preferred:

```bash
YANA_MEMORY_VECTOR_BACKEND=auto python3 your_entrypoint.py
```

## Benchmark

Install Mojo 1.0 in an isolated environment, then run from the repository root:

```bash
python3 -m core.lib.hermes_adapted.mojo.benchmark \
  --backend mojo --entries 2000 --dimensions 768 --iterations 5
```

The benchmark compares every score against the Python reference and exits
non-zero if Mojo was requested but unavailable. Do not make Mojo the default
unless representative macOS and Linux results show a material improvement and
the fallback tests remain green.

## Strict extension probe

On a Linux host with the stable Mojo package installed, run:

```bash
PYTHONPATH="$PWD" python3 \
  core/lib/hermes_adapted/mojo/integration_probe.py
```

The probe compiles/imports the actual extension and executes valid input,
invalid element types, invalid candidate shape, and dimension mismatch in
separate child processes. Invalid types and shapes must become catchable Python
exceptions; dimension mismatch retains the established `0.0` score contract.
Any native abort, signal, or hard process exit fails the parent probe.

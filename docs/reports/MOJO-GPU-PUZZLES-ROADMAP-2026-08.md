# Mojo / GPU Puzzles Roadmap — Applicability to Yana AI

**Date:** 2026-08-21
**Source:** github.com/modular/mojo-gpu-puzzles (35 puzzles), "Inspired by
Modular Mojo GPU Puzzles." Reuse policy (per 2026-08-22 clarification): this
is not a dependency integration -- Yana does not pull the puzzles repo in as
a package or submodule. For any given piece, once it is understood well
enough to judge, the choice is: a **stable, directly reusable** piece may be
taken as-is (attributed, license-compatible) to save the cost of rewriting
something already correct; anything **not yet proven stable** for Yana's use
is rewritten from scratch rather than adapted in place. Every puzzle entry
below that leads to real code will say explicitly which path was taken --
"reused" or "rewritten" -- not a blanket "patterns only, nothing copied"
claim.
**Grounded in:** real hands-on verification performed the same day on this
host (Apple M4, macOS 27.0, Xcode 27.0), not just reading the puzzle
descriptions. See `MOJO-VECTOR-RECALL-PILOT-2026-08.md` for the full pilot
verification log.

## Method

Each puzzle is scored against four categories:

- **NOW** -- directly usable today, either already implemented (the vector
  recall pilot) or ready to attempt with today's confirmed toolchain
  capability.
- **NEXT** -- a real Yana use case exists, but it is blocked on something
  concrete: the CPU/SIMD pilot must first clear its own performance bar, or
  the Mojo `gpu` module must become available on this platform.
- **LATER** -- plausible future use, no current blocker identified, but not
  worth building until NOW/NEXT work lands and proves the approach.
- **NOT APPLICABLE** -- does not fit Yana's architecture, hardware target, or
  current priorities.

## What changed since the earlier puzzle-mapping document

**Correction (2026-08-22):** an earlier version of this document claimed
`gpu` was not importable on this platform (`unable to locate module 'gpu'`
on both the `max` release and `max-nightly` channels). That finding was
wrong -- caused by testing `import gpu` (bare) instead of `from std.gpu
import ...`, missing the `std.` prefix every other stdlib import in this
codebase already uses (`from std.python import PythonObject`, etc.), and by
guessing `gpu.host.DeviceContext` instead of the correct
`max.gpu.host.DeviceContext` (`DeviceContext` lives under the `max` package
namespace -- it's part of MAX's custom-ops framework, not raw Mojo `std`).
Confirmed via the open-source `modular/modular` repo
(`mojo/stdlib/std/gpu/` exists; `gpu/host/__init__.mojo` exports only
`get_gpu_target`, not `DeviceContext`) and by testing the corrected imports
directly: `from std.gpu import thread_idx` compiles, and
`from max.gpu.host import DeviceContext; DeviceContext()` genuinely
constructs a GPU device context on this Apple M4 host. See section 4 of
`MOJO-VECTOR-RECALL-PILOT-2026-08.md` for the exact commands and current
status (device context creation works; a correctly-mutating compute kernel
is not yet demonstrated -- a real remaining bug, not a missing package).

Two real findings from today's verification change the picture:

1. **GPU device detection and device-context creation both work on this
   host.** `from max.driver import Accelerator` correctly reports
   `Device(type=gpu, id=0)`, `api=metal`, `architecture_name=4-metal4`,
   `model_name=Apple M4`, `is_host=False`, and
   `from max.gpu.host import DeviceContext; DeviceContext()` genuinely
   constructs a working GPU context (see the correction above). What is
   **not yet demonstrated** is a compute kernel that correctly mutates
   GPU-resident memory end to end -- a same-day attempt compiled and ran
   without error but left the buffer unchanged, an unresolved closure/
   capture-convention bug, not a platform limitation.
2. **The CPU/SIMD pilot itself does not yet clear its own bar.** The current
   uncommitted `yana_mojo_vector_recall.mojo` (SIMD dot product, cached
   norms) compiles clean and passes all 5 integration-probe cases on this
   real Apple M4 host, but the benchmark measures `0.85x` at
   `2000x768` and `0.82x` at `20000x768` -- **slower than the Python
   reference**, not faster, and below the workflow's own required `2.0x`
   minimum speedup gate. See the pilot report's verification log for the
   exact commands and numbers.

Both findings push every GPU-dependent puzzle (Metal kernel work, puzzles
16-33) from NOW into NEXT at earliest, and reframe puzzle 1-15/23-29 (CPU
SIMD/reduction techniques, already used in the pilot) as **NEXT, blocked on
proving a real speedup**, not NOW.

## Puzzle-by-puzzle categorization

| # | Puzzle | Yana use | Category |
|---|--------|----------|----------|
| 1-8 | Map, broadcast, blocks, shared memory | Foundational patterns used by the pilot (batching, contiguous buffers) | NEXT -- pilot must clear its own speedup bar first |
| 9-10 | Debug GPU, race/memory sanitizer | Kernel test/CI patterns | NEXT -- relevant once any GPU kernel exists; Metal-native equivalent is Xcode GPU tools / Metal API Validation, not a CUDA sanitizer port |
| 11 | Pooling | Embedding/telemetry aggregation | LATER -- no current use case |
| 12 | Dot product | Memory recall, semantic routing | **NOW (implemented)** -- this is the pilot's actual kernel; NOT yet proven faster, see finding 2 above |
| 13 | 1D convolution | CPU/GPU/RAM anomaly detection over time series | LATER -- Health Intelligence has no current driving need |
| 14 | Prefix sum | Token-budget timeline, event indexing | LATER |
| 15 | Axis sum | Batch metrics, vector norms | **NOW (implemented)** -- candidate-norm caching in the pilot is exactly this pattern |
| 16 | Matrix multiplication | Batch embedding scoring, reranker | NEXT -- same performance-gate blocker as puzzle 12 |
| 17 | MAX custom convolution | Yana kernel inside MAX Graph | NOT APPLICABLE now -- no MAX Graph integration exists in Yana; premature |
| 18 | Softmax | Reranking / attention-adjacent local inference | LATER |
| 19 | Attention | Context compressor or local inference experiment | LATER |
| 20-22 | PyTorch ops, embedding, fusion, backward | Fine-tuning/training research | NOT APPLICABLE -- training is not a Yana priority; explicitly out of scope per the architecture boundary below |
| 23 | Functional GPU patterns, benchmark | General accelerator API, performance gating | **NOW (implemented)** -- `benchmark.py --minimum-speedup` is exactly this pattern, already in the pilot's CI workflow |
| 24-27 | Warp/block reduction, broadcast, scan | Top-K retrieval, normalization, histogram telemetry | NEXT -- blocked on a working GPU kernel first (device context works, kernel-launch correctness does not yet) |
| 28 | Async memory/copy overlap | Overlap embedding copy with next-batch processing | NEXT -- same working-kernel blocker as 24-27 |
| 29 | Synchronization/pipeline | Safe embed -> score -> Top-K pipeline | NEXT -- same working-kernel blocker as 24-27 |
| 30-32 | Profiling, occupancy, bank conflicts | Post-correctness optimization | LATER -- premature before any GPU kernel exists and is proven correct |
| 33 | Tensor cores | Large matmul/embedding, local model kernels | NOT APPLICABLE on this hardware -- tensor cores are an NVIDIA-specific term; Apple GPUs have no direct equivalent exposed at this level |
| 34 | GPU clusters SM90+ | -- | **NOT APPLICABLE** -- explicitly NVIDIA-specific (Hopper SM90), no Apple Silicon path |
| 35 | Memory alignment | Buffer layout for Python/Mojo/Metal vector storage | NEXT -- directly relevant once a GPU buffer path exists; the pilot already applies basic alignment discipline in its CPU buffers |

## Explicit call-outs (as required)

- **Puzzle 34 (SM90+)**: NVIDIA-specific, no Apple Silicon path. Confirmed
  NOT APPLICABLE, not just deprioritized.
- **CUDA sanitizer (puzzles 9-10)**: does not port as-is to Metal. The
  Metal-native equivalents are Xcode's Metal API Validation layer and GPU
  Frame Capture/debugger, not a source-compatible sanitizer.
- **Training/PyTorch backward (puzzles 20-22)**: not a Yana priority. Yana
  is an inference-time and recall-time accelerator target, not a training
  platform. NOT APPLICABLE for the foreseeable roadmap, not merely LATER.
- **Architecture boundary (unconditional, all puzzles)**: policy, approval
  gates, hooks, locking, process supervision, the audit hash chain, and the
  capability runtime stay in Rust/Python/Bash. No puzzle in this list, no
  matter how compelling the algorithm, changes that boundary. GPU/Mojo is
  optional compute on the data plane only.

## Bottom line

Of 35 puzzles, roughly 8 map to patterns Yana has already implemented or
directly needs (NOW/NEXT-with-a-clear-path), about 10 are plausible future
work with no current driving need (LATER), and the remainder (training ops,
SM90+, tensor cores, MAX Graph integration) are NOT APPLICABLE to Yana's
current architecture or hardware target. This is a narrower NOW/NEXT count
than the earlier "25-30 of 35" framing -- the difference is today's real
verification (device context works, but a correctly-mutating GPU kernel is
not yet demonstrated; CPU/SIMD path not yet faster than Python), not a
change in the underlying algorithmic mapping, which remains substantially
accurate.

## Immediate recommendation

Do not start any NEXT-tier work (GPU kernels, warp/block reduction,
async pipelines) until:

1. A minimal GPU kernel actually mutates GPU-resident memory correctly and
   the result is copied back and verified on the host. Device-context
   creation already works (`from max.gpu.host import DeviceContext`); the
   remaining gap is a closure/capture-convention bug in kernel launch, not
   package availability -- see section 4 of
   `MOJO-VECTOR-RECALL-PILOT-2026-08.md` for the exact reproduction.
2. The existing CPU/SIMD pilot (puzzle 12/15/23, already implemented)
   either clears its own `--minimum-speedup 2.0` gate with evidence, or the
   gate itself is revisited with a documented reason (e.g. correctness and
   fallback safety are the actual goal at this scale, not speed).

Everything in the LATER and NOT APPLICABLE tiers should stay exactly there:
not started, not designed, not scoped as "engines" until a NOW/NEXT item is
proven and a concrete Yana need drives the next one.

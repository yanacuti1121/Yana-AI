"""Benchmark the optional Mojo vector scorer against the Python reference.

Run from the repository root:

    python3 -m core.lib.hermes_adapted.mojo.benchmark --backend mojo

The command exits non-zero when Mojo was requested but could not be loaded, or
when its scores diverge from the reference implementation.
"""
from __future__ import annotations

import argparse
import os
import random
import time

from core.lib.hermes_adapted import mojo_vector_recall as vector_recall


def _elapsed_seconds(callable_, iterations: int) -> float:
    started = time.perf_counter()
    for _ in range(iterations):
        callable_()
    return time.perf_counter() - started


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", choices=("python", "auto", "mojo"), default="mojo")
    parser.add_argument("--entries", type=int, default=2_000)
    parser.add_argument("--dimensions", type=int, default=768)
    parser.add_argument("--iterations", type=int, default=5)
    args = parser.parse_args()

    if args.entries <= 0 or args.dimensions <= 0 or args.iterations <= 0:
        parser.error("entries, dimensions, and iterations must be positive")

    random_source = random.Random(7)
    query = [random_source.uniform(-1.0, 1.0) for _ in range(args.dimensions)]
    candidates = [
        [random_source.uniform(-1.0, 1.0) for _ in range(args.dimensions)]
        for _ in range(args.entries)
    ]

    reference = lambda: vector_recall._python_cosine_scores(query, candidates)
    expected = reference()
    python_seconds = _elapsed_seconds(reference, args.iterations)

    os.environ[vector_recall._BACKEND_ENV] = args.backend
    vector_recall._loaded_mode = None
    actual = vector_recall.cosine_scores(query, candidates)
    status = vector_recall.backend_status()
    if len(actual) != len(expected) or any(
        abs(left - right) > 1e-9 for left, right in zip(actual, expected)
    ):
        print("ERROR: accelerator scores differ from Python reference")
        return 1
    if args.backend == "mojo" and status["active"] != "mojo":
        print(f"ERROR: {status['detail']}")
        return 2

    accelerated_seconds = _elapsed_seconds(
        lambda: vector_recall.cosine_scores(query, candidates), args.iterations
    )
    print(f"backend={status['active']} detail={status['detail']}")
    print(
        f"shape={args.entries}x{args.dimensions} iterations={args.iterations} "
        f"python={python_seconds:.6f}s selected={accelerated_seconds:.6f}s "
        f"speedup={python_seconds / accelerated_seconds:.2f}x"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Optional Mojo acceleration for memory-recall vector scoring.

This module owns the narrow boundary between Yana's Python memory adapter and
an optional Mojo kernel.  Python remains responsible for network I/O, secret
redaction, cache consistency, thresholds, and result selection.  Mojo only
computes a batch of cosine-similarity scores.

The pilot is opt-in.  Set ``YANA_MEMORY_VECTOR_BACKEND=mojo`` (or ``auto``)
to try the Mojo module.  Missing tooling, import failures, malformed results,
or runtime errors fall back to the reference Python implementation without
changing recall semantics.
"""
from __future__ import annotations

import importlib
import math
import os
from pathlib import Path
import sys
from typing import Callable, List, Optional, Sequence


_BACKEND_ENV = "YANA_MEMORY_VECTOR_BACKEND"
_MOJO_MODES = {"auto", "mojo"}
_MOJO_MODULE = "yana_mojo_vector_recall"

ScoreBackend = Callable[[Sequence[float], Sequence[Sequence[float]]], Sequence[float]]

_loaded_mode: Optional[str] = None
_mojo_backend: Optional[ScoreBackend] = None
_backend_detail = "Mojo accelerator not requested"


def cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    """Reference cosine implementation shared by fallback and tests."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def _python_cosine_scores(
    query: Sequence[float], candidates: Sequence[Sequence[float]]
) -> List[float]:
    return [cosine_similarity(query, candidate) for candidate in candidates]


def _requested_mode() -> str:
    return os.environ.get(_BACKEND_ENV, "python").strip().lower() or "python"


def _load_mojo_backend() -> Optional[ScoreBackend]:
    global _backend_detail, _loaded_mode, _mojo_backend

    mode = _requested_mode()
    if mode == _loaded_mode:
        return _mojo_backend

    _loaded_mode = mode
    _mojo_backend = None
    if mode not in _MOJO_MODES:
        _backend_detail = "Python reference backend selected"
        return None

    module_dir = Path(__file__).with_name("mojo")
    try:
        import mojo.importer  # type: ignore[import-not-found]  # noqa: F401

        module_dir_text = str(module_dir)
        sys.path.insert(0, module_dir_text)
        try:
            importlib.invalidate_caches()
            module = importlib.import_module(_MOJO_MODULE)
        finally:
            if sys.path and sys.path[0] == module_dir_text:
                sys.path.pop(0)
            else:
                try:
                    sys.path.remove(module_dir_text)
                except ValueError:
                    pass
        backend = getattr(module, "cosine_scores", None)
        if not callable(backend):
            raise AttributeError(f"{_MOJO_MODULE}.cosine_scores is not callable")
    except Exception as exc:
        _backend_detail = f"Mojo unavailable; using Python ({type(exc).__name__}: {exc})"
        return None

    _mojo_backend = backend
    _backend_detail = "Mojo vector kernel active"
    return _mojo_backend


def cosine_scores(
    query: Sequence[float], candidates: Sequence[Sequence[float]]
) -> List[float]:
    """Return one cosine score per candidate with a fail-safe fallback."""
    global _backend_detail, _mojo_backend

    backend = _load_mojo_backend()
    if backend is None:
        return _python_cosine_scores(query, candidates)

    try:
        scores = [float(value) for value in backend(query, candidates)]
        if len(scores) != len(candidates) or not all(
            math.isfinite(score) for score in scores
        ):
            raise ValueError("Mojo backend returned invalid score output")
        return scores
    except Exception as exc:
        _mojo_backend = None
        _backend_detail = f"Mojo failed; using Python ({type(exc).__name__}: {exc})"
        return _python_cosine_scores(query, candidates)


def backend_status() -> dict[str, str]:
    """Return observable pilot state without forcing a Mojo import."""
    requested = _requested_mode()
    return {
        "requested": requested,
        "active": (
            "mojo"
            if _loaded_mode == requested and _mojo_backend is not None
            else "python"
        ),
        "detail": _backend_detail,
    }

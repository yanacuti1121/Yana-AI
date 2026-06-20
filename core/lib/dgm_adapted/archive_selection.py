"""Fitness/novelty-weighted parent selection for an evolutionary agent archive.

Origin:  jennyzzt/dgm (Darwin Godel Machine), DGM_outer.py
         (`choose_selfimproves`, `update_archive`, `get_full_eval_threshold`)
         (Apache-2.0) -- https://github.com/jennyzzt/dgm
         pinned commit a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2
Ported:  2026-06-20. Extracted only the pure selection/scoring math from
         `choose_selfimproves` -- the surrounding code in the original builds
         the `candidates` dict by reading `metadata.json` off disk for every
         commit in the archive; that file-I/O assembly step was NOT ported
         (it's DGM's own on-disk archive layout, not a generic algorithm).
         This port takes the already-built `candidates` mapping as input.

         `select_lowest_scoring` is a faithful translation of the upstream
         `method == 'best'` branch, which sorts ASCENDING and takes the
         lowest-scoring candidates despite the branch being named "best".
         This was kept exactly as observed, not "fixed" -- it plausibly
         reflects a deliberate choice to spend self-improvement effort on
         the weakest performers (the ones with the most headroom to
         improve), but that is a guess, not a verified fact, so the
         behavior is preserved as-is per Hermes-style porting discipline
         (translate faithfully, document anomalies, don't silently correct
         what might be intentional).

         The `no_darwin` baseline branch in `choose_parent_commits` also
         preserves an original quirk: it returns exactly ONE parent commit
         (the last one in the archive) regardless of how many were
         requested -- `commits[-1:]` is a length-1 slice, not a repeat-to-n.
License: Apache-2.0 (see vendor/dgm/_upstream/LICENSE)

Purpose: "pick which archived candidate(s) to mutate/improve next, weighted
by fitness and penalized by how many children it already has" is a directly
reusable pattern for any of Yana AI's own fitness/trust-score-weighted
selection needs (multi-agent task routing, A/B skill rollout sampling under
57-canary-deployment-law.md, circuit-breaker recovery candidate choice) --
independent of DGM's specific SWE-bench-patch archive.
"""
from __future__ import annotations

import math
import random
from typing import Optional


def sigmoid_transform(score: float, steepness: float = 10.0, midpoint: float = 0.5) -> float:
    """Squash a raw score into (0, 1), centered on `midpoint` with the given steepness."""
    return 1 / (1 + math.exp(-steepness * (score - midpoint)))


def _normalize(weights: list[float]) -> list[float]:
    total = sum(weights)
    return [w / total for w in weights]


def score_proportional_probabilities(scores: list[float]) -> list[float]:
    """Selection probability proportional to sigmoid-transformed score."""
    return _normalize([sigmoid_transform(s) for s in scores])


def score_child_proportional_probabilities(
    scores: list[float], children_counts: list[int]
) -> list[float]:
    """Like `score_proportional_probabilities`, but candidates with more existing
    children are penalized (weight *= 1 / (1 + children_count)) -- a simple
    novelty/diversity pressure against repeatedly picking the same parent.
    """
    transformed = [sigmoid_transform(s) for s in scores]
    child_factor = [1 / (1 + c) for c in children_counts]
    return _normalize([t * f for t, f in zip(transformed, child_factor)])


def select_lowest_scoring(
    candidates: dict[str, float], n: int, rng: random.Random = random
) -> list[str]:
    """Select the `n` lowest-scoring candidate keys (see module docstring: this is
    a faithful port of upstream's `method == 'best'` branch, which is in fact
    lowest-scoring-first). Pads with random resamples of the selection itself
    if there are fewer than `n` candidates available, exactly as upstream does.
    """
    sorted_keys = sorted(candidates, key=lambda k: candidates[k])
    selected = sorted_keys[: min(n, len(sorted_keys))]
    if len(selected) < n:
        selected = selected + rng.choices(selected, k=n - len(selected))
    return selected


def choose_parent_commits(
    candidates: dict[str, dict],
    n: int,
    method: str = "random",
    run_baseline: Optional[str] = None,
    rng: random.Random = random,
) -> list[str]:
    """Choose `n` parent commit keys from `candidates`.

    `candidates` maps commit-id -> {"accuracy_score": float, "children_count": int}.

    `run_baseline == "no_darwin"` overrides `method` entirely and returns the
    single most-recently-added candidate (see module docstring for the
    length-1 quirk this preserves).
    """
    commits = list(candidates.keys())

    if run_baseline == "no_darwin":
        return commits[-1:]

    if method == "score_prop":
        scores = [candidates[c]["accuracy_score"] for c in commits]
        probabilities = score_proportional_probabilities(scores)
        return rng.choices(commits, probabilities, k=n)

    if method == "score_child_prop":
        scores = [candidates[c]["accuracy_score"] for c in commits]
        children_counts = [candidates[c]["children_count"] for c in commits]
        probabilities = score_child_proportional_probabilities(scores, children_counts)
        return rng.choices(commits, probabilities, k=n)

    if method == "best":
        scores_by_commit = {c: candidates[c]["accuracy_score"] for c in commits}
        return select_lowest_scoring(scores_by_commit, n, rng)

    return rng.choices(commits, k=n)


def full_eval_threshold(scores: list[float], floor: float = 0.4) -> float:
    """Second-highest score among `scores` (or the only score, if just one), floored at `floor`.

    `scores` should already include the baseline/original score alongside any
    archive scores the caller considers eligible (matches upstream's
    `archive_scores` construction, which is not itself ported here -- it
    depends on DGM's own per-commit `total_submitted_instances` eligibility
    check against on-disk eval subset files).
    """
    if not scores:
        raise ValueError("scores must not be empty")
    ranked = sorted(scores, reverse=True)
    threshold = ranked[1] if len(ranked) > 1 else ranked[0]
    return max(threshold, floor)


def should_keep_in_archive(score: float, original_score: float, noise_leeway: float = 0.1) -> bool:
    """Whether a candidate's score clears the bar to be kept (`method='keep_better'`)."""
    return score >= (original_score - noise_leeway)

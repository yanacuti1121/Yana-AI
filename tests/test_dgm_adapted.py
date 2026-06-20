"""Tests for the dgm_adapted batch (archive selection, patch filtering, tool output formatting).

Origin: core/lib/dgm_adapted/*.py
        (ported from jennyzzt/dgm, Apache-2.0)
"""
import random

import pytest

from core.lib.dgm_adapted import archive_selection as a
from core.lib.dgm_adapted import patch_filter as pf
from core.lib.dgm_adapted import tool_output_format as t


# -- archive_selection: sigmoid / probabilities --


def test_sigmoid_transform_at_midpoint_is_half():
    assert a.sigmoid_transform(0.5) == pytest.approx(0.5)


def test_sigmoid_transform_monotonic():
    assert a.sigmoid_transform(0.1) < a.sigmoid_transform(0.5) < a.sigmoid_transform(0.9)


def test_score_proportional_probabilities_equal_scores():
    probs = a.score_proportional_probabilities([0.5, 0.5])
    assert probs == pytest.approx([0.5, 0.5])
    assert sum(probs) == pytest.approx(1.0)


def test_score_proportional_probabilities_favors_higher_score():
    probs = a.score_proportional_probabilities([0.9, 0.1])
    assert probs[0] > probs[1]


def test_score_child_proportional_penalizes_more_children():
    # equal scores, but candidate 0 has more children -> should get less weight
    probs = a.score_child_proportional_probabilities([0.5, 0.5], [5, 0])
    assert probs[0] < probs[1]


# -- archive_selection: select_lowest_scoring ("best" branch) --


def test_select_lowest_scoring_picks_smallest_first():
    candidates = {"a": 0.9, "b": 0.1, "c": 0.5}
    assert a.select_lowest_scoring(candidates, 2, rng=random.Random(0)) == ["b", "c"]


def test_select_lowest_scoring_pads_by_resampling_when_n_exceeds_pool():
    candidates = {"a": 0.9, "b": 0.1}
    result = a.select_lowest_scoring(candidates, 4, rng=random.Random(0))
    assert len(result) == 4
    assert set(result) <= {"a", "b"}
    assert result[:2] == ["b", "a"]


# -- archive_selection: choose_parent_commits --


def test_choose_parent_commits_no_darwin_baseline_returns_single_last_commit():
    candidates = {
        "c1": {"accuracy_score": 0.9, "children_count": 0},
        "c2": {"accuracy_score": 0.1, "children_count": 0},
    }
    # length-1 regardless of n -- preserved upstream quirk
    result = a.choose_parent_commits(candidates, 5, method="score_prop", run_baseline="no_darwin")
    assert result == ["c2"]


def test_choose_parent_commits_best_method_picks_lowest_scoring():
    candidates = {
        "c1": {"accuracy_score": 0.9, "children_count": 0},
        "c2": {"accuracy_score": 0.1, "children_count": 0},
        "c3": {"accuracy_score": 0.5, "children_count": 0},
    }
    result = a.choose_parent_commits(candidates, 2, method="best", rng=random.Random(0))
    assert result == ["c2", "c3"]


def test_choose_parent_commits_random_method_returns_n_from_pool():
    candidates = {
        "c1": {"accuracy_score": 0.9, "children_count": 0},
        "c2": {"accuracy_score": 0.1, "children_count": 0},
    }
    result = a.choose_parent_commits(candidates, 3, method="random", rng=random.Random(0))
    assert len(result) == 3
    assert set(result) <= {"c1", "c2"}


# -- archive_selection: full_eval_threshold / should_keep_in_archive --


def test_full_eval_threshold_returns_second_highest():
    assert a.full_eval_threshold([0.9, 0.5, 0.3]) == pytest.approx(0.5)


def test_full_eval_threshold_single_score_uses_itself():
    assert a.full_eval_threshold([0.6]) == pytest.approx(0.6)


def test_full_eval_threshold_floored_at_minimum():
    assert a.full_eval_threshold([0.2, 0.1]) == pytest.approx(0.4)


def test_full_eval_threshold_rejects_empty():
    with pytest.raises(ValueError):
        a.full_eval_threshold([])


def test_should_keep_in_archive():
    assert a.should_keep_in_archive(0.85, 0.9, noise_leeway=0.1) is True
    assert a.should_keep_in_archive(0.7, 0.9, noise_leeway=0.1) is False


# -- patch_filter --

_PATCH = (
    "diff --git a/foo.py b/foo.py\n"
    "index 111..222 100644\n"
    "--- a/foo.py\n"
    "+++ b/foo.py\n"
    "@@ -1,1 +1,1 @@\n"
    "-old\n"
    "+new\n"
    "diff --git a/bar_polyglot.py b/bar_polyglot.py\n"
    "index 333..444 100644\n"
    "--- a/bar_polyglot.py\n"
    "+++ b/bar_polyglot.py\n"
    "@@ -1,1 +1,1 @@\n"
    "-old2\n"
    "+new2\n"
)


def test_filter_patch_by_files_keeps_only_target():
    result = pf.filter_patch_by_files(_PATCH, ["foo.py"])
    assert "a/foo.py" in result
    assert "bar_polyglot.py" not in result


def test_filter_patch_by_files_no_match_returns_empty():
    assert pf.filter_patch_by_files(_PATCH, ["nonexistent.py"]) == ""


def test_remove_patch_by_files_drops_matching_keyword():
    result = pf.remove_patch_by_files(_PATCH, "polyglot")
    assert "bar_polyglot.py" not in result
    assert "a/foo.py" in result


def test_remove_patch_by_files_keyword_is_case_insensitive():
    result = pf.remove_patch_by_files(_PATCH, "POLYGLOT")
    assert "bar_polyglot.py" not in result


# -- tool_output_format --


def test_maybe_truncate_under_limit_unchanged():
    assert t.maybe_truncate("short") == "short"


def test_maybe_truncate_over_limit_clips_with_marker():
    result = t.maybe_truncate("x" * 20, max_length=10)
    assert result == ("x" * 10) + "\n<response clipped>"


def test_format_output_numbers_lines():
    result = t.format_output("line1\nline2", "/tmp/f.py")
    assert "cat -n" in result
    assert "1\tline1" in result
    assert "2\tline2" in result


def test_filter_error_passes_through_normal_errors():
    assert t.filter_error("real error\nmore detail") == "real error\nmore detail"


def test_filter_error_strips_ioctl_noise_block():
    err = "before\nInappropriate ioctl for device\njunk1\njunk2\nactual error after\n<<exit>>\n"
    assert t.filter_error(err) == "before\nactual error after"


def test_filter_error_empty_string():
    assert t.filter_error("") == ""

from pathlib import Path

import pytest

from trace_audit.checks import run_all
from trace_audit.parser import build_model
from trace_audit.report import score, trust_label

FIX = Path(__file__).parent / "fixtures"


def ids(findings):
    return {f.id for f in findings}


@pytest.fixture(scope="module")
def dirty():
    return run_all(build_model(FIX / "dirty.jsonl"))


@pytest.fixture(scope="module")
def clean():
    return run_all(build_model(FIX / "clean.jsonl"))


@pytest.fixture(scope="module")
def creep():
    return run_all(build_model(FIX / "creep.jsonl"))


def test_dirty_catches_claim_pass(dirty):
    assert "TA001" in ids(dirty)


def test_dirty_catches_no_verify(dirty):
    assert "TA002" in ids(dirty)


def test_dirty_catches_test_tamper(dirty):
    assert "TA003" in ids(dirty)


def test_dirty_catches_silent_error(dirty):
    assert "TA004" in ids(dirty)


def test_clean_has_zero_findings(clean):
    assert clean == []


def test_clean_score_is_100(clean):
    assert score(clean) == 100 and trust_label(100) == "HIGH"


def test_creep_catches_scope_creep(creep):
    assert "TA005" in ids(creep)


def test_creep_does_not_fire_ta001_ta002(creep):
    # session verified after edits and verify passed
    assert "TA001" not in ids(creep)
    assert "TA002" not in ids(creep)


def test_dirty_score_drops(dirty):
    assert score(dirty) < 70  # 2×HIGH + MED + LOW at minimum


# ── v0.1.1 calibration regression tests (from 7 real-session findings) ───────
@pytest.fixture(scope="module")
def newtest():
    return run_all(build_model(FIX / "newtest.jsonl"))


@pytest.fixture(scope="module")
def weaken():
    return run_all(build_model(FIX / "weaken.jsonl"))


@pytest.fixture(scope="module")
def multitask():
    return run_all(build_model(FIX / "multitask.jsonl"))


def test_new_test_file_is_not_tampering(newtest):
    """Real FP 2026-07-04: adding 8 new tests fired TA003. Must not."""
    assert "TA003" not in ids(newtest)
    assert newtest == []


def test_weakened_assertion_is_high(weaken):
    ta003 = [f for f in weaken if f.id == "TA003"]
    assert ta003 and ta003[0].severity == "HIGH"


def test_modified_test_without_weakening_is_med(dirty):
    ta003 = [f for f in dirty if f.id == "TA003"]
    assert ta003 and ta003[0].severity == "MED"


def test_multitask_session_skips_scope_creep(multitask):
    """Real FP 2026-07-04: long multi-task session fired TA005. Must not."""
    assert "TA005" not in ids(multitask)


# ── v0.2 regression: TA003 per-file turn attribution ─────────────────────────
@pytest.fixture(scope="module")
def multifile_tamper():
    return run_all(build_model(FIX / "multifile-tamper.jsonl"))


def test_ta003_reports_one_finding_per_file(multifile_tamper):
    """Real bug found 2026-07-05 running trace-audit on a real 6,679-turn
    session: two test files edited ~20 turns apart were bundled into one
    Finding stamped with only the later turn, hiding when the earlier file
    was actually touched."""
    ta003 = [f for f in multifile_tamper if f.id == "TA003"]
    assert len(ta003) == 2


def test_ta003_turns_are_distinct_and_match_each_files_own_edit(multifile_tamper):
    ta003 = [f for f in multifile_tamper if f.id == "TA003"]
    turns = sorted(f.turn for f in ta003)
    assert turns[0] < turns[1], "each file must keep its own turn, not the last edit's turn"
    by_path = {}
    for f in ta003:
        for path in ("tests/test_auth.py", "tests/test_payments.py"):
            if path in f.message:
                by_path[path] = f.turn
    assert by_path["tests/test_auth.py"] < by_path["tests/test_payments.py"]

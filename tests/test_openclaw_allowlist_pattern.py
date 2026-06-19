"""Smoke test for the ported exec-allowlist glob matcher.

Origin: core/lib/openclaw_adapted/allowlist_pattern.py
        (ported from openclaw/openclaw, MIT)
"""
from core.lib.openclaw_adapted.allowlist_pattern import matches_exec_allowlist_pattern


def test_exact_path_matches():
    assert matches_exec_allowlist_pattern("/usr/bin/git", "/usr/bin/git") is True


def test_exact_path_mismatch():
    assert matches_exec_allowlist_pattern("/usr/bin/git", "/usr/bin/curl") is False


def test_single_star_does_not_cross_path_separator():
    assert matches_exec_allowlist_pattern("/home/user/*", "/home/user/sub/file") is False
    assert matches_exec_allowlist_pattern("/home/user/*", "/home/user/file") is True


def test_double_star_crosses_path_separators():
    assert matches_exec_allowlist_pattern("/home/**", "/home/user/sub/file") is True


def test_question_mark_matches_single_non_separator_char():
    assert matches_exec_allowlist_pattern("/bin/ls?", "/bin/ls1") is True
    assert matches_exec_allowlist_pattern("/bin/ls?", "/bin/ls12") is False


def test_empty_pattern_never_matches():
    assert matches_exec_allowlist_pattern("", "/usr/bin/git") is False
    assert matches_exec_allowlist_pattern("   ", "/usr/bin/git") is False


def test_wildcard_pattern_normalizes_dot_segments_in_target():
    # A wildcard pattern scoped to /home/user/** must not be defeated by a
    # target containing a literal `..` segment that resolves back out of it.
    assert matches_exec_allowlist_pattern("/home/user/**", "/home/user/sub/../../etc/passwd") is False

#!/usr/bin/env python3
"""
YAMTAM Scanner condition engine tests.
Tests that condition logic (accompanied_by, not_accompanied_by, etc.) works correctly.
Run: python3 tests/test_scanner_conditions.py
"""

import json
import os
import sys
import unittest
from pathlib import Path

# Add core/scripts to path
REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "core" / "scripts"))
import audit_scanner as scanner

FIXTURES = REPO / "tests" / "fixtures"
SCANNER_DIR = str(REPO / "scanner")


def scan_file_with_scope(file_path: str, scope: str) -> list[dict]:
    """Run only the given scanner scope against a single file."""
    rule_sets = scanner.load_scanner_rules(SCANNER_DIR)
    target = str(Path(file_path).parent)
    findings = []
    for rs in rule_sets:
        if rs.get("scope") == scope:
            findings.extend(scanner.scan_file(file_path, target, rs))
    return [f for f in findings if f.get("id") != "SCAN_SKIP"]


class TestShellConditions(unittest.TestCase):

    def test_SH008_fires_when_no_set_e(self):
        """SH008 (not_followed_by set -e) should fire on script without set -e."""
        f = str(FIXTURES / "shell" / "bad_no_set_e.sh")
        findings = scan_file_with_scope(f, "shell-scripts")
        ids = [x["id"] for x in findings]
        self.assertIn("SH008", ids,
                      f"Expected SH008 for script without set -e. Got: {ids}")

    def test_SH008_no_false_positive_when_set_e_present(self):
        """SH008 should NOT fire when set -euo pipefail is present."""
        f = str(FIXTURES / "shell" / "good_set_e.sh")
        findings = scan_file_with_scope(f, "shell-scripts")
        ids = [x["id"] for x in findings]
        self.assertNotIn("SH008", ids,
                         f"False positive: SH008 fired on script that has set -e. Findings: {ids}")


class TestCIWorkflowConditions(unittest.TestCase):

    def test_CI001_fires_automerge_without_reviews(self):
        """CI001 (auto-merge + not_accompanied_by review check) should fire."""
        f = str(FIXTURES / "ci" / "bad_automerge_no_reviews.yml")
        findings = scan_file_with_scope(f, "ci-workflows")
        ids = [x["id"] for x in findings]
        self.assertIn("CI001", ids,
                      f"Expected CI001 for auto-merge without reviews. Got: {ids}")

    def test_CI001_no_false_positive_with_reviews(self):
        """CI001 should NOT fire when auto-merge is gated by required.reviews."""
        f = str(FIXTURES / "ci" / "good_automerge_with_reviews.yml")
        findings = scan_file_with_scope(f, "ci-workflows")
        ids = [x["id"] for x in findings]
        self.assertNotIn("CI001", ids,
                         f"False positive: CI001 fired on workflow with required-approvals. Findings: {ids}")

    def test_CI007_fires_when_no_permissions(self):
        """CI007 (on:/jobs: not_preceded_by permissions:) should fire."""
        f = str(FIXTURES / "ci" / "bad_no_permissions.yml")
        findings = scan_file_with_scope(f, "ci-workflows")
        ids = [x["id"] for x in findings]
        self.assertIn("CI007", ids,
                      f"Expected CI007 for workflow without permissions block. Got: {ids}")

    def test_CI007_no_false_positive_with_permissions(self):
        """CI007 should NOT fire when permissions block exists above on:/jobs:."""
        f = str(FIXTURES / "ci" / "good_permissions_declared.yml")
        findings = scan_file_with_scope(f, "ci-workflows")
        ids = [x["id"] for x in findings]
        self.assertNotIn("CI007", ids,
                         f"False positive: CI007 fired on workflow with permissions declared. Findings: {ids}")


class TestMCPConditions(unittest.TestCase):

    def test_MCP009_fires_db_without_read_only(self):
        """MCP009 should fire when DB MCP server has no read_only: true."""
        f = str(FIXTURES / "mcp" / "bad_db_no_read_only.json")
        findings = scan_file_with_scope(f, "mcp-config")
        ids = [x["id"] for x in findings]
        self.assertIn("MCP009", ids,
                      f"Expected MCP009 for DB server without read_only. Got: {ids}")

    def test_MCP009_no_false_positive_with_read_only(self):
        """MCP009 should NOT fire when DB MCP server has read_only: true."""
        f = str(FIXTURES / "mcp" / "good_db_read_only.json")
        findings = scan_file_with_scope(f, "mcp-config")
        ids = [x["id"] for x in findings]
        self.assertNotIn("MCP009", ids,
                         f"False positive: MCP009 fired on DB server with read_only: true. Findings: {ids}")


class TestRecomputeStats(unittest.TestCase):

    def _make_report(self, findings: list[dict]) -> dict:
        return {
            "findings": findings,
            "score": 999,
            "risk_level": "UNKNOWN",
            "summary": {},
            "analytics": {},
            "scan_stats": {"files_scanned": 5, "files_skipped": 0,
                           "scanners_run": 1, "checks_applied": 10, "duration_ms": 0},
        }

    def test_recompute_updates_score(self):
        findings = [
            {"id": "SH001", "severity": "HIGH", "file": "a.sh", "category": "shell-risk",
             "rule": "x", "reason": "", "fix": "", "confidence": "HIGH"},
        ]
        report = self._make_report(findings)
        scanner.recompute_report_stats(report)
        self.assertEqual(report["score"], 80)  # 100 - 20 (HIGH)

    def test_recompute_updates_summary_total(self):
        findings = [
            {"id": "SH001", "severity": "HIGH", "file": "a.sh", "category": "shell-risk",
             "rule": "x", "reason": "", "fix": "", "confidence": "HIGH"},
            {"id": "SH002", "severity": "MEDIUM", "file": "b.sh", "category": "shell-risk",
             "rule": "x", "reason": "", "fix": "", "confidence": "HIGH"},
        ]
        report = self._make_report(findings)
        scanner.recompute_report_stats(report)
        self.assertEqual(report["summary"]["total"], 2)
        self.assertEqual(report["summary"]["high"], 1)
        self.assertEqual(report["summary"]["medium"], 1)

    def test_recompute_sets_status_findings_when_has_findings(self):
        findings = [
            {"id": "SH001", "severity": "HIGH", "file": "a.sh", "category": "shell-risk",
             "rule": "x", "reason": "r", "fix": "f", "confidence": "HIGH"},
        ]
        report = self._make_report(findings)
        scanner.recompute_report_stats(report)
        self.assertEqual(report["status"], "findings")

    def test_recompute_sets_status_clean_when_no_findings(self):
        report = self._make_report([])
        scanner.recompute_report_stats(report)
        self.assertEqual(report["status"], "clean")

    def test_recompute_sets_status_clean_when_only_info(self):
        findings = [
            {"id": "INFO001", "severity": "INFO", "file": "a.sh", "category": "shell-risk",
             "rule": "x", "reason": "r", "fix": "f", "confidence": "HIGH"},
        ]
        report = self._make_report(findings)
        scanner.recompute_report_stats(report)
        self.assertEqual(report["status"], "clean")

    def test_recompute_analytics_by_category(self):
        findings = [
            {"id": "SH001", "severity": "HIGH", "file": "a.sh", "category": "shell-risk",
             "rule": "x", "reason": "", "fix": "", "confidence": "HIGH"},
            {"id": "CI001", "severity": "CRITICAL", "file": "b.yml", "category": "ci-workflow",
             "rule": "y", "reason": "", "fix": "", "confidence": "HIGH"},
        ]
        report = self._make_report(findings)
        scanner.recompute_report_stats(report)
        self.assertEqual(report["analytics"]["by_category"]["shell-risk"], 1)
        self.assertEqual(report["analytics"]["by_category"]["ci-workflow"], 1)


class TestMessageField(unittest.TestCase):

    def test_finding_has_message_field(self):
        """Every finding from scan_file must have a non-empty message field."""
        f = str(FIXTURES / "shell" / "bad_no_set_e.sh")
        findings = scan_file_with_scope(f, "shell-scripts")
        self.assertTrue(findings, "Expected at least one finding from bad_no_set_e.sh")
        for finding in findings:
            self.assertIn("message", finding,
                          f"Finding {finding['id']} missing 'message' field")
            self.assertTrue(finding["message"],
                            f"Finding {finding['id']} has empty 'message'")

    def test_message_falls_back_to_id_when_no_reason(self):
        """message fallback chain: reason → description → id."""
        check = {"id": "TEST001", "severity": "HIGH"}
        # Simulate what scan_file does for the message field
        message = (check.get("message") or check.get("reason") or
                   check.get("description") or check["id"])
        self.assertEqual(message, "TEST001")


if __name__ == "__main__":
    unittest.main(verbosity=2)

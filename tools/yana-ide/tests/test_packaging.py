"""Kiểm tra cấu hình đóng gói (pyproject.toml) không để dữ liệu người dùng lọt vào gói PyPI, và khớp với bộ cài.

Bối cảnh: yana-ai 1.5.1 đã công bố kèm core/memory/L2_session, agent-journals, audit, trust-ledger.json (106 file) vì
`force-include` bỏ qua `exclude`. Chạy: python3 -m unittest discover -s tools/yana-ide/tests -p test_packaging.py
"""
import sys
import tomllib
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "tools/yana-ide/setup"))

from yana_install import seed  # noqa: E402

STATE = ("core/memory/L2_session", "core/memory/agent-journals", "core/memory/audit", "core/memory/trust-ledger.json")
CODE_IN_MEMORY = ("core/memory/secure-logger.js", "core/memory/trust-ledger.js")


class PackagingKeepsStateOut(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        data = tomllib.loads((REPO / "pyproject.toml").read_text(encoding="utf-8"))
        targets = data["tool"]["hatch"]["build"]["targets"]
        cls.force_include = targets["wheel"]["force-include"]
        cls.sdist = targets["sdist"]

    def test_core_is_not_mapped_as_a_whole(self):
        self.assertNotIn("core", self.force_include, "force-include ignores exclude rules, so mapping core wholesale ships its state")

    def test_no_state_path_is_force_included(self):
        for source in self.force_include:
            self.assertFalse(any(source == s or source.startswith(s + "/") for s in STATE), source)

    def test_every_core_directory_is_still_shipped(self):
        for entry in sorted((REPO / "core").iterdir()):
            if entry.name == "memory" or not entry.is_dir():
                continue
            self.assertIn(f"core/{entry.name}", self.force_include, f"core/{entry.name} would be dropped from the wheel")

    def test_the_two_memory_code_files_still_ship(self):
        for path in CODE_IN_MEMORY:
            self.assertIn(path, self.force_include)
            self.assertTrue((REPO / path).is_file(), path)

    def test_the_sdist_excludes_state_too_because_the_wheel_is_built_from_it(self):
        self.assertEqual(sorted(self.sdist["exclude"]), sorted(STATE))

    def test_the_installer_skips_the_same_state(self):
        for path in STATE:
            probe = path + "/x" if not path.endswith(".json") else path
            self.assertTrue(probe.startswith(seed.DEFAULT_EXCLUDED_PREFIXES), f"installer would copy {path}")
        for path in CODE_IN_MEMORY:
            self.assertFalse(path.startswith(seed.DEFAULT_EXCLUDED_PREFIXES), f"installer would skip code file {path}")


if __name__ == "__main__":
    unittest.main()

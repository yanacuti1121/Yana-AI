"""The files that the sibling repositories read from a Yana-AI checkout must keep existing.

yana-web and Yana-studio were split out of this repository, but they still depend on it:
- yana-web's server.js resolves its root to a Yana-AI checkout (YANA_ROOT_DIR) and reads
  MANIFEST.json, core/skills, core/agents, memory/L1_atomic and scripts/yana-rt-wrapper.js.
- yana-web's Dockerfile builds yana-rt from Cargo.toml, Cargo.lock, rust-toolchain.toml, src/,
  README.md and LICENSE.
- Yana-studio's Control Center inspects core/hooks, core/config/core-lock.json,
  core/scripts/giamthi_service.py, core/scripts/sandbox-exec.sh and .claude/settings.json.

Moving or renaming any of these breaks a repository that CI here does not build, so each path is
pinned. If a move is intended, change the consumer in the same step and update this list.
"""
import json
import tomllib
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

YANA_WEB_SERVER_PATHS = (
    "MANIFEST.json",
    "core/skills",
    "core/agents",
    "memory/L1_atomic",
    "scripts/yana-rt-wrapper.js",
)
YANA_WEB_DOCKER_PATHS = (
    "Cargo.toml",
    "Cargo.lock",
    "rust-toolchain.toml",
    "README.md",
    "LICENSE",
    "src/main.rs",
)
YANA_STUDIO_PATHS = (
    "core/hooks",
    "core/config/core-lock.json",
    "core/scripts/giamthi_service.py",
    "core/scripts/sandbox-exec.sh",
    ".claude/settings.json",
)
MIN_SKILL_DIRECTORIES = 1000  # the catalog holds about 2,000; far fewer means the wrong directory


class BridgeContract(unittest.TestCase):
    def assert_paths_exist(self, consumer: str, paths: tuple[str, ...]) -> None:
        missing = [p for p in paths if not (ROOT / p).exists()]
        self.assertEqual(missing, [], f"{consumer} reads paths that no longer exist: {missing}")

    def test_paths_read_by_the_yana_web_server_exist(self) -> None:
        self.assert_paths_exist("yana-web server.js", YANA_WEB_SERVER_PATHS)

    def test_paths_copied_by_the_yana_web_dockerfile_exist(self) -> None:
        self.assert_paths_exist("yana-web Dockerfile", YANA_WEB_DOCKER_PATHS)

    def test_paths_inspected_by_the_yana_studio_control_center_exist(self) -> None:
        self.assert_paths_exist("Yana-studio Control Center", YANA_STUDIO_PATHS)

    def test_the_skill_catalog_is_not_empty(self) -> None:
        # yana-web /health answers 503 when core/skills has no skill directory.
        skills = [p for p in (ROOT / "core" / "skills").iterdir() if p.is_dir() and not p.name.startswith(".")]
        self.assertGreater(len(skills), MIN_SKILL_DIRECTORIES)

    def test_agents_directory_holds_agent_definitions(self) -> None:
        agents = list((ROOT / "core" / "agents").rglob("*.md"))
        self.assertGreater(len(agents), 0)

    def test_manifest_is_valid_json_with_the_fields_yana_web_reads(self) -> None:
        manifest = json.loads((ROOT / "MANIFEST.json").read_text(encoding="utf-8"))
        for field in ("version", "skills_count", "agents_count"):
            self.assertIn(field, manifest, f"MANIFEST.json lost the {field} field")
        self.assertIsInstance(manifest["skills_count"], int)

    def test_cargo_still_builds_the_yana_rt_binary_the_dockerfile_asks_for(self) -> None:
        cargo = tomllib.loads((ROOT / "Cargo.toml").read_text(encoding="utf-8"))
        binaries = {entry["name"] for entry in cargo.get("bin", [])}
        self.assertIn("yana-rt", binaries)

    def test_the_wrapper_script_starts_with_a_shebang_on_the_first_byte(self) -> None:
        # A stray blank line before the shebang once made yana-rt-wrapper.js impossible to exec.
        first_line = (ROOT / "scripts" / "yana-rt-wrapper.js").read_bytes().split(b"\n", 1)[0]
        self.assertTrue(first_line.startswith(b"#!"), "shebang must be on the very first line")


if __name__ == "__main__":
    unittest.main()

"""Every workflow job that builds this crate must prefetch pdfium first, and the script must stay safe.

liteparse-pdfium-sys downloads pdfium from build.rs with its own TLS stack, which has failed in CI with a
handshake error and cannot be used behind a proxy it does not trust. core/scripts/prefetch-pdfium.sh fetches
the same asset with curl, checked against a pinned SHA-256, into the cache build.rs reads first. A job that
runs cargo without it falls back to the fragile downloader, which is how the three release workflows were
left exposed while ci.yml was not.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = sorted((ROOT / ".github" / "workflows").glob("*.yml"))
SCRIPT = ROOT / "core" / "scripts" / "prefetch-pdfium.sh"
MIRROR = ROOT / ".claude" / "scripts" / "prefetch-pdfium.sh"
CARGO_BUILDS_THE_CRATE = re.compile(r"\bcargo\s+(build|test|check|clippy|run|bench)\b")
PREFETCH = "prefetch-pdfium.sh"
JOB_HEADER = re.compile(r"^  ([A-Za-z0-9_-]+):\s*$")

# Jobs that run cargo but do not compile liteparse-pdfium-sys, with the reason.
EXEMPT_JOBS: dict[tuple[str, str], str] = {}


def jobs(workflow: Path) -> dict[str, list[str]]:
    """Job name -> its lines, for a workflow written with 2-space job keys under `jobs:`."""
    result: dict[str, list[str]] = {}
    in_jobs = False
    current = None
    for line in workflow.read_text(encoding="utf-8").splitlines():
        if re.match(r"^jobs:\s*$", line):
            in_jobs = True
            continue
        if not in_jobs:
            continue
        if re.match(r"^\S", line):  # another top-level key ends the jobs block
            break
        header = JOB_HEADER.match(line)
        if header:
            current = header.group(1)
            result[current] = []
        elif current is not None:
            result[current].append(line)
    return result


def code_lines(lines: list[str]) -> list[tuple[int, str]]:
    return [(i, line) for i, line in enumerate(lines) if not line.lstrip().startswith("#")]


class PdfiumPrefetch(unittest.TestCase):
    def test_workflows_and_jobs_were_found(self) -> None:
        self.assertGreater(len(WORKFLOWS), 5)
        self.assertGreater(len(jobs(ROOT / ".github" / "workflows" / "ci.yml")), 5)

    def test_every_job_that_runs_cargo_prefetches_pdfium_first(self) -> None:
        offenders = []
        for workflow in WORKFLOWS:
            for name, lines in jobs(workflow).items():
                if (workflow.name, name) in EXEMPT_JOBS:
                    continue
                code = code_lines(lines)
                cargo = [i for i, line in code if CARGO_BUILDS_THE_CRATE.search(line)]
                if not cargo:
                    continue
                prefetch = [i for i, line in code if PREFETCH in line]
                if not prefetch or min(prefetch) > min(cargo):
                    offenders.append(f"{workflow.name}: job '{name}'")
        self.assertEqual(
            offenders, [],
            "these jobs run cargo without prefetching pdfium first "
            "(add `bash core/scripts/prefetch-pdfium.sh` before the first cargo step):\n" + "\n".join(offenders),
        )

    def test_exemptions_still_name_a_job_that_runs_cargo(self) -> None:
        # An exemption for a job that no longer exists or no longer runs cargo would hide a real gap later.
        for (workflow, name), reason in EXEMPT_JOBS.items():
            self.assertTrue(reason)
            lines = jobs(ROOT / ".github" / "workflows" / workflow).get(name)
            self.assertIsNotNone(lines, f"{workflow} has no job {name}")
            self.assertTrue(any(CARGO_BUILDS_THE_CRATE.search(line) for _, line in code_lines(lines)))

    def test_a_cross_build_names_its_target(self) -> None:
        # build.rs picks the asset from the build TARGET; the script defaults to this machine, which is
        # wrong for x86_64-apple-darwin built on an arm64 runner.
        text = (ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")
        self.assertRegex(text, r"PDFIUM_TARGET:\s*\$\{\{\s*matrix\.target\s*\}\}")

    def test_the_script_pins_a_checksum_for_every_asset_it_can_fetch(self) -> None:
        text = SCRIPT.read_text(encoding="utf-8")
        assets = set(re.findall(r'asset="(pdfium-[a-z0-9-]+)"', text))
        self.assertEqual(assets, {"pdfium-mac-arm64", "pdfium-mac-x64", "pdfium-linux-x64", "pdfium-linux-arm64"})
        for asset in assets:
            self.assertRegex(text, rf"{asset}\)\s+echo \"[0-9a-f]{{64}}\"", f"no pinned SHA-256 for {asset}")
        self.assertIn("SHA-256 mismatch", text)

    def test_the_tag_matches_what_build_rs_downloads(self) -> None:
        # The cache path the script fills is <tag with / as _>/<asset>; a tag bump in only one place would
        # make the prefetch a silent no-op.
        text = SCRIPT.read_text(encoding="utf-8")
        tag = re.search(r'^PDFIUM_TAG="([^"]+)"', text, re.M).group(1)
        safe = re.search(r'^PDFIUM_TAG_SAFE="([^"]+)"', text, re.M).group(1)
        self.assertEqual(tag.replace("/", "_"), safe)

    def test_the_mirror_is_identical(self) -> None:
        self.assertEqual(SCRIPT.read_bytes(), MIRROR.read_bytes(), ".claude/scripts copy drifted from core/scripts")


if __name__ == "__main__":
    unittest.main()

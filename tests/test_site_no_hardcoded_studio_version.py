"""The site must not hardcode a Yana Studio version number.

Regression: docs/ (what Cloudflare serves) said "Studio 1.5" in the nav of every
page, in titles and headings, and "this is Studio 1.5.1 running" on the Studio
page, while the shipped app moved on to 1.6.x. The real version belongs to the
GitHub release data that docs/assets/ecosystem-pages.js loads, not to static
markup, which goes stale on the next release.

A few phrases describe the release filter itself ("1.5 and later") and stay.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

DOCS = Path(__file__).resolve().parents[1] / "docs"

# "Studio 1.5", "Studio 1.5.1", "Studio 1.6.2", with any suffix glued on.
VERSIONED = re.compile(r"Studio v?\d+\.\d+(?:\.\d+)?[^\s<\"'),;:]*")

# Descriptions of the release filter, not claims about the current version.
ALLOWED = (
    re.compile(r"Studio 1\.5\+"),
    re.compile(r"Studio 1\.5-generation"),
    re.compile(r"Studio 1\.5(?= trở)"),
    re.compile(r"Studio 1\.5(?= 계열)"),
)


def _is_allowed(text: str, start: int, end: int) -> bool:
    return any(
        (m := pattern.search(text, start)) is not None and m.start() == start
        for pattern in ALLOWED
    )


def _hardcoded_versions() -> list[str]:
    found: list[str] = []
    files = [*sorted(DOCS.glob("*.html")), *sorted((DOCS / "assets").glob("*.js"))]
    for path in files:
        text = path.read_text(encoding="utf-8")
        for match in VERSIONED.finditer(text):
            if not _is_allowed(text, match.start(), match.end()):
                found.append(f"{path.relative_to(DOCS.parent)}: {match.group(0)}")
    return found


class SiteStudioVersionTests(unittest.TestCase):
    def test_no_hardcoded_studio_version_in_served_pages(self) -> None:
        found = _hardcoded_versions()
        self.assertEqual(
            found,
            [],
            "static Studio version numbers go stale; use 'Yana Studio' and let "
            "ecosystem-pages.js show the release data:\n" + "\n".join(found[:20]),
        )

    def test_release_filter_still_reads_release_data(self) -> None:
        # The fix removes static numbers; it must not remove the dynamic source.
        script = (DOCS / "assets" / "ecosystem-pages.js").read_text(encoding="utf-8")
        self.assertIn("/releases?per_page=", script)
        self.assertIn("isStudio15OrNewer", script)
        self.assertIn("latest.name || latest.tag_name", script)


if __name__ == "__main__":
    unittest.main()

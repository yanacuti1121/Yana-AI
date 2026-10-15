"""The website is built from an allowlist of docs/, so internal documents never reach the public site."""
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("build_site", ROOT / "scripts" / "build_site.py")
build_site = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build_site)


def write(root: Path, rel: str, text: str = "x") -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def published(out: Path) -> set:
    return {str(p.relative_to(out)) for p in out.rglob("*") if p.is_file()}


class AllowlistTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.src = Path(self.tmp.name) / "docs"
        self.out = Path(self.tmp.name) / "site"
        for rel in ["index.html", "download.html", "site.css", "app.js", "robots.txt", "sitemap.xml", "logo.png", "latest.json", "latest.json.sig",
                    "assets/img.png", "assets/style.css", "music/a.mp3", "downloads/fw.bin"]:
            write(self.src, rel)

    def test_the_website_files_are_published(self):
        build_site.build(self.src, self.out)
        self.assertEqual(published(self.out), {"index.html", "download.html", "site.css", "app.js", "robots.txt", "sitemap.xml", "logo.png", "latest.json",
                                               "latest.json.sig", "assets/img.png", "assets/style.css", "music/a.mp3", "downloads/fw.bin"})

    def test_internal_documents_and_state_are_never_published(self):
        for rel in ["RUNBOOK.md", "notes.py", "audit.jsonl", ".claude/state/per-tool-circuit.jsonl", "CNAME", "_private.html", "other.json",
                    "reference/guide.html", "adr/0001.md", "assets/notes.md", "assets/.hidden", "assets/.git/config", "assets/tool.py", "assets/log.jsonl"]:
            write(self.src, rel)
        build_site.build(self.src, self.out)
        out = published(self.out)
        for leaked in ["RUNBOOK.md", "notes.py", "audit.jsonl", "CNAME", "_private.html", "other.json", "reference/guide.html", "adr/0001.md", "assets/notes.md",
                       "assets/.hidden", "assets/tool.py", "assets/log.jsonl"]:
            self.assertNotIn(leaked, out)
        self.assertFalse(any(part.startswith(".") for rel in out for part in Path(rel).parts), out)

    def test_a_symbolic_link_is_never_followed(self):
        secret = Path(self.tmp.name) / "secret.txt"
        secret.write_text("TOP SECRET")
        os.symlink(secret, self.src / "assets" / "link.png")
        os.symlink(secret, self.src / "linked.html")
        build_site.build(self.src, self.out)
        self.assertNotIn("assets/link.png", published(self.out))
        self.assertNotIn("linked.html", published(self.out))

    def test_it_refuses_to_write_into_a_folder_that_already_has_files(self):
        self.out.mkdir()
        (self.out / "old.html").write_text("old")
        with self.assertRaises(build_site.BuildError):
            build_site.build(self.src, self.out)
        self.assertEqual(published(self.out), {"old.html"})

    def test_it_refuses_an_output_folder_inside_the_source(self):
        with self.assertRaises(build_site.BuildError):
            build_site.build(self.src, self.src / "site")

    def test_the_result_reports_what_it_did(self):
        result = build_site.build(self.src, self.out)
        self.assertEqual(result["files"], 13)
        self.assertGreater(result["bytes"], 0)


class LinkTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.site = Path(self.tmp.name)

    def test_links_that_resolve_are_fine_and_missing_ones_are_reported(self):
        write(self.site, "index.html", '<a href="download">d</a><a href="about.html">a</a><img src="assets/x.png"><script src="/app.js"></script>'
                                       '<a href="https://example.com/x">e</a><a href="mailto:a@b.c">m</a><a href="tel:+1">t</a><a href="#top">h</a>'
                                       '<a href="missing.html">m</a><img src="assets/gone.png"><a href="${src}">t</a>')
        write(self.site, "download.html")
        write(self.site, "about.html")
        write(self.site, "assets/x.png")
        write(self.site, "app.js")
        self.assertEqual(sorted(build_site.missing_links(self.site)), [("index.html", "assets/gone.png"), ("index.html", "missing.html")])

    def test_a_link_into_a_folder_that_is_not_published_is_missing(self):
        write(self.site, "index.html", '<a href="reference/guide.html">g</a>')
        self.assertEqual(build_site.missing_links(self.site), [("index.html", "reference/guide.html")])


class RealSiteTests(unittest.TestCase):
    @unittest.skipUnless((ROOT / "docs" / "index.html").exists(), "docs/ not present")
    def test_the_real_docs_folder_builds_without_internal_documents_or_broken_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "site"
            build_site.build(ROOT / "docs", out)
            files = published(out)
            self.assertIn("index.html", files)
            for rel in files:
                self.assertFalse(rel.endswith((".md", ".py", ".jsonl")), rel)
                self.assertFalse(any(part.startswith(".") for part in Path(rel).parts), rel)
            self.assertEqual(build_site.missing_links(out), [])


class VercelConfigTests(unittest.TestCase):
    def setUp(self):
        import json
        self.config = json.loads((ROOT / "vercel.json").read_text())

    def header_values(self, source):
        for rule in self.config.get("headers", []):
            if rule["source"] == source:
                return {h["key"].lower(): h["value"] for h in rule["headers"]}
        return {}

    def test_it_builds_the_allowlisted_site_and_nothing_else(self):
        self.assertEqual(self.config["outputDirectory"], "site")
        self.assertIn("scripts/build_site.py", self.config["buildCommand"])
        # The repository root has a package.json of the product: it must not be installed to build a static site.
        self.assertEqual(self.config["installCommand"], "true")
        self.assertIsNone(self.config["framework"])

    def test_pages_without_an_extension_keep_working_and_files_are_never_redirected(self):
        self.assertIs(self.config["cleanUrls"], True)
        self.assertIs(self.config["trailingSlash"], False)
        # The app does not follow redirects when it checks for an update, so no rule may touch latest.json.
        self.assertNotIn("redirects", self.config)
        self.assertNotIn("rewrites", self.config)

    def test_the_update_files_are_never_cached_and_not_sniffed(self):
        for source in ("/latest.json", "/latest.json.sig"):
            values = self.header_values(source)
            self.assertIn("must-revalidate", values.get("cache-control", ""), source)
            self.assertEqual(values.get("x-content-type-options"), "nosniff", source)

    def test_every_page_gets_basic_security_headers(self):
        values = self.header_values("/(.*)")
        self.assertEqual(values.get("x-content-type-options"), "nosniff")
        self.assertEqual(values.get("x-frame-options"), "SAMEORIGIN")
        self.assertIn("referrer-policy", values)

    def test_a_cli_deploy_does_not_upload_the_build_output_of_the_product(self):
        ignored = (ROOT / ".vercelignore").read_text().split()
        for heavy in ("target", "node_modules", ".git"):
            self.assertIn(heavy, ignored)


if __name__ == "__main__":
    unittest.main()

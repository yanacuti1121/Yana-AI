"""Tests for the governed presentation workflow."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "core/scripts/presentation_studio.py"
SPEC = importlib.util.spec_from_file_location("presentation_studio", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
studio = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = studio
SPEC.loader.exec_module(studio)


def brief(**changes):
    values = {
        "topic": "Local AI",
        "audience": "students",
        "language": "Vietnamese",
        "slide_count": 4,
        "style": "calm",
        "goal": "understand local inference",
        "citations": True,
        "speaker_notes": True,
        "source_paths": (),
    }
    values.update(changes)
    return studio.PresentationBrief(**values)


class PresentationStudioTests(unittest.TestCase):
    def test_confirmation_gate_has_confirm_edit_and_quit(self) -> None:
        for answer, expected in [("c", "confirm"), ("edit", "edit"), ("q", "quit")]:
            self.assertEqual(studio.confirm_outline(input_fn=lambda _prompt, value=answer: value), expected)

    def test_noninteractive_confirmation_requires_saved_brief(self) -> None:
        with self.assertRaises(SystemExit):
            studio.parse_args(["--yes"])

    def test_unique_output_directory_never_overwrites(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "local-ai").mkdir()
            (root / "local-ai-2").mkdir()
            self.assertEqual(studio.unique_output_directory(root, "Local AI"), root / "local-ai-3")

    def test_parse_slides_rejects_wrong_count(self) -> None:
        with self.assertRaisesRegex(ValueError, "exactly 2 slides"):
            studio.parse_slides('{"slides": []}', 2)

    def test_parse_slides_accepts_strict_json(self) -> None:
        slides = studio.parse_slides(
            json.dumps({"slides": [{"title": "One", "bullets": ["A"], "notes": "N"}]}),
            1,
        )
        self.assertEqual(slides[0].bullets, ("A",))

    def test_extracts_docx_text_without_third_party_parser(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "source.docx"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr(
                    "word/document.xml",
                    '<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Hello Yana</w:t></w:r></w:p></w:body></w:document>',
                )
            self.assertEqual(studio.extract_source_text(path), "Hello Yana")

    def test_rejects_oversized_office_xml_part(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "source.docx"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("word/document.xml", b"x" * (studio.MAX_OOXML_XML_BYTES + 1))
            with self.assertRaisesRegex(ValueError, "exceeds 5 MiB"):
                studio.extract_source_text(path)

    def test_parse_slides_bounds_model_controlled_text(self) -> None:
        payload = json.dumps({"slides": [{"title": "x" * 181, "bullets": ["A"], "notes": ""}]})
        with self.assertRaisesRegex(ValueError, "title must be"):
            studio.parse_slides(payload, 1)

    def test_dry_run_writes_nothing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            brief_path = root / "brief.json"
            brief_path.write_text(json.dumps({**studio.asdict(brief()), "source_paths": []}), encoding="utf-8")
            completed = subprocess.run(
                [sys.executable, str(SCRIPT), "--brief-json", str(brief_path), "--no-ai", "--dry-run", "--output-dir", str(root / "out")],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIn("Dry run: no files written", completed.stdout)
            self.assertFalse((root / "out").exists())

    def test_quit_at_confirmation_writes_nothing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            brief_path = root / "brief.json"
            brief_path.write_text(json.dumps({**studio.asdict(brief()), "source_paths": []}), encoding="utf-8")
            completed = subprocess.run(
                [sys.executable, str(SCRIPT), "--brief-json", str(brief_path), "--no-ai", "--output-dir", str(root / "out")],
                input="q\n",
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIn("Cancelled; no files were written", completed.stdout)
            self.assertFalse((root / "out").exists())

    def test_runtime_request_keeps_api_key_out_of_argv(self) -> None:
        response = json.dumps({"slides": [{"title": "One", "bullets": ["A"], "notes": ""}]})
        completed = subprocess.CompletedProcess(
            ["yana-rt"],
            0,
            stdout=json.dumps({"type": "completed", "message": response}) + "\n",
            stderr="",
        )
        with mock.patch.object(studio, "runtime_binary", return_value="yana-rt"), mock.patch.dict(
            studio.os.environ, {"OPENAI_API_KEY": "secret-value"}
        ), mock.patch.object(studio.subprocess, "run", return_value=completed) as run:
            slides = studio.generate_with_yana(brief(slide_count=1), "", "openai", "gpt-test")
        command = run.call_args.args[0]
        self.assertNotIn("secret-value", command)
        self.assertIn("secret-value", run.call_args.kwargs["input"])
        self.assertEqual(slides[0].title, "One")

    def test_model_failure_is_fail_closed_without_explicit_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            brief_path = Path(temporary) / "brief.json"
            brief_path.write_text(json.dumps({**studio.asdict(brief()), "source_paths": []}), encoding="utf-8")
            with mock.patch.object(studio, "generate_with_yana", side_effect=RuntimeError("offline")):
                with self.assertRaisesRegex(RuntimeError, "--fallback"):
                    studio.main(["--brief-json", str(brief_path), "--dry-run"])


if __name__ == "__main__":
    unittest.main()

# Yana Presentation Studio

`yana-ai presentation` creates an editable presentation through a governed,
local-first workflow:

1. Yana asks for the topic, audience, language, slide count, visual style,
   learning goal, source files, citations, and speaker notes.
2. Yana builds and prints the complete slide outline.
3. The user must choose **confirm**, **edit**, or **quit**. No presentation is
   written before explicit confirmation.
4. Yana calls the canonical `yana-rt chat --headless` runtime. The default is
   the local Ollama provider; a configured cloud provider can be selected with
   `--provider` without changing the presentation workflow.
5. The editable `.pptx` and a machine-readable `presentation.json` are saved
   under `~/Downloads/Yana-Presentations/<topic>/`. Existing output is never
   overwritten; Yana creates a numbered directory instead.

## Supported source documents

| Input | Support | Requirement |
|---|---|---|
| Markdown / text | Native | None |
| HTML | Native text extraction | None |
| DOCX | Native OOXML text extraction | None |
| PPTX | Native OOXML slide-text extraction | None |
| PDF | Text extraction | Poppler `pdftotext` |

The primary output is an editable PowerPoint `.pptx`. Add `--pdf` to also
export PDF when LibreOffice is installed. The JSON file preserves the brief,
provider/model selection, slide content, and speaker notes for later editing.

## Install and run

```bash
pip install 'yana-ai[presentation]'
yana-ai presentation
```

In a source checkout, install only the renderer with
`python3 -m pip install python-pptx`.

For a fully local run, start Ollama and use its model catalog:

```bash
yana-ai presentation --provider ollama --model qwen3:14b
```

For repeatable automation, save a reviewed brief and confirm it explicitly:

```bash
yana-ai presentation --brief-json brief.json --yes
```

`--yes` is rejected without `--brief-json`; this prevents automation from
silently skipping the clarification and review contract. Use `--dry-run` to
preview an outline without writing files, and `--no-ai` for deterministic
source-based generation. Model failures are fail-closed by default; add
`--fallback` only when deterministic output is acceptable.

## Privacy and safety

- Local providers keep inference local; cloud providers receive the brief and
  extracted source text, so do not select one for private material.
- API keys are read from environment variables and sent to `yana-rt` through
  stdin JSON, never command-line arguments.
- Source files are read only. Generated files are never executed.
- PDF export is a local LibreOffice subprocess with an argv array, not a shell
  command string.

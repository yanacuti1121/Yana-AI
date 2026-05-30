---
name: markitdown
description: >
  Convert any file or document to Markdown using Microsoft MarkItDown.
  Use when user wants to "convert PDF to markdown", "import this doc into vault",
  "turn this Word file into markdown", "extract text from PDF", "convert PPTX to notes",
  "parse this Excel as markdown table", or needs to feed documents to an LLM pipeline.
  Do NOT use for HTML → Markdown when browser rendering is needed — use a DOM parser instead.
origin: adapted:microsoft/markitdown
license: MIT © Microsoft
version: 1.0.0
compatibility: "Python 3.8+. pip install markitdown[all]"
---

<!-- Adapted from microsoft/markitdown (MIT). Supports: PDF, DOCX, XLSX, PPTX, images, audio, HTML, CSV, JSON, XML, ZIP, YouTube URLs, EPubs. -->

## When to Use

- Converting documents for LLM ingestion / vault import
- Extracting structured text from office files
- Batch-converting a directory of files to markdown
- Feeding non-text files into a RAG pipeline

Supported inputs: PDF, DOCX, XLSX, PPTX, images (OCR), audio (transcription), HTML, CSV, JSON, XML, ZIP, YouTube URLs, EPubs

## Setup

```bash
pip install markitdown[all]   # full features (OCR, audio, etc.)
# or minimal:
pip install markitdown
```

## Usage

### CLI
```bash
markitdown input.pdf > output.md
markitdown input.docx -o output.md
markitdown https://www.youtube.com/watch?v=... > transcript.md
```

### Python API
```python
from markitdown import MarkItDown

md = MarkItDown()

# Single file
result = md.convert("document.pdf")
print(result.text_content)

# From URL
result = md.convert("https://example.com/paper.pdf")

# From stream
with open("file.docx", "rb") as f:
    result = md.convert_stream(f, file_extension=".docx")
```

### Batch conversion (directory → vault)
```bash
for f in docs/*.{pdf,docx,pptx}; do
  slug=$(basename "${f%.*}" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')
  markitdown "$f" > vault/notes/${slug}.md
  echo "Converted: $f → ${slug}.md"
done
```

### With LLM for image descriptions (optional)
```python
from markitdown import MarkItDown
import openai

client = openai.OpenAI()
md = MarkItDown(llm_client=client, llm_model="gpt-4o-mini")
result = md.convert("diagram.png")  # describes images as markdown alt-text
```

## Vault Integration

Import directly into yamtam vault:
```bash
# Convert and import
markitdown report.pdf > /tmp/report.md
yamtam-rt vault new "$(head -1 /tmp/report.md | sed 's/^# //')" \
  --lang vi --tags import,pdf --vault .
# Then paste content into the created note
```

## Anti-Fake-Pass

```
❌ Claiming conversion worked without checking result.text_content is non-empty
❌ Using markitdown for HTML pages that require JavaScript rendering
❌ Not checking file extension support before converting
✅ Verify output has content: len(result.text_content) > 100
✅ Test with a small file first before batch conversion
```

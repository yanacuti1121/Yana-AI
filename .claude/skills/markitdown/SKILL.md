---
name: markitdown
description: Convert files and office documents to Markdown for LLM ingestion — supports DOCX, XLSX, PPTX, PDF, HTML, CSV, JSON, XML, images (OCR), audio, and ZIP archives. Optimized for RAG pipelines and text analysis, not document fidelity.
license: MIT
compatibility: yamtam-engine >= 1.3.54
metadata:
  origin: yamtam-engine — synthesized from microsoft/markitdown (MIT)
  version: 1.0.0
triggers:
  - "markitdown"
  - "convert document to markdown"
  - "convert office document to markdown"
  - "PDF to markdown"
  - "DOCX to markdown"
  - "PPTX to markdown"
  - "XLSX to markdown"
  - "extract text from document LLM"
  - "feed document into RAG"
  - "batch convert files to text"
  - "OCR image to markdown"
  - "microsoft markitdown"
  - "file to markdown LLM"
do_not_use_for:
  - High-fidelity document rendering — use Pandoc or LibreOffice instead
  - Layout-preserving PDF conversion — use pdfplumber or PyMuPDF instead
  - Production document transformation with complex styling requirements
see_also:
  - rag-architect
  - headroom
  - in-memory-vector-storage
---

# markitdown — File → Markdown for LLM Pipelines

**Source:** microsoft/markitdown (MIT) — lightweight, LLM-optimized document conversion

## Why markitdown

Documents are rich but LLMs need plain text. markitdown strips formatting noise
and outputs clean Markdown optimized for LLM context and RAG indexing.
One consistent API regardless of input format.

## Install

```bash
pip install 'markitdown[all]'   # all format support
# or minimal:
pip install markitdown
# OCR support:
pip install 'markitdown[markitdown-ocr]'
```

## Core API

```python
from markitdown import MarkItDown

md = MarkItDown()

# Convert any supported file
result = md.convert("report.docx")
print(result.text_content)    # clean Markdown string

# From URL
result = md.convert("https://example.com/paper.pdf")

# From file stream
with open("presentation.pptx", "rb") as f:
    result = md.convert(f, file_extension=".pptx")
```

## CLI

```bash
markitdown report.docx                   # stdout
markitdown report.pdf > output.md        # to file
markitdown *.xlsx | llm summarize -      # pipe to LLM
```

## Supported Formats

| Format | Notes |
|--------|-------|
| `.docx` | Tables, lists, headings preserved |
| `.xlsx` | Each sheet → Markdown table |
| `.pptx` | Each slide → Markdown section |
| `.pdf` | Text extraction (not OCR) |
| `.html` | Strips tags, keeps structure |
| `.csv` | → Markdown table |
| `.json` / `.xml` | Structured → readable Markdown |
| Images | OCR via `markitdown-ocr` plugin |
| Audio | Transcription via plugin |
| `.zip` | Recurses and converts all contents |

## RAG Pipeline Pattern

```python
from markitdown import MarkItDown
from pathlib import Path

md = MarkItDown()

def ingest_documents(doc_dir: str) -> list[dict]:
    docs = []
    for path in Path(doc_dir).rglob("*"):
        if path.suffix in {".docx", ".pdf", ".pptx", ".xlsx", ".html"}:
            try:
                result = md.convert(str(path))
                docs.append({
                    "source": str(path),
                    "content": result.text_content,
                    "char_count": len(result.text_content)
                })
            except Exception:
                pass   # skip unsupported files
    return docs

# Feed into vector store
chunks = ingest_documents("./knowledge-base/")
```

## With headroom (token reduction)

```python
from markitdown import MarkItDown
from headroom import compress

md = MarkItDown()
result = md.convert("large_report.pdf")

# Compress before injecting into agent context
compressed = compress(result.text_content)
print(f"Tokens saved: {compressed.tokens_saved}")
# Pass compressed.compressed to LLM, not raw text
```

#!/usr/bin/env python3
"""
vault-import — Convert file/URL → Markdown và lưu vào YAMTAM vault.

Usage:
  python3 tools/vault-import.py document.pdf
  python3 tools/vault-import.py https://example.com
  python3 tools/vault-import.py --dir ./docs/ --ext pdf,docx
  python3 tools/vault-import.py file.pdf --out core/memory/vault/
"""
import sys
import os
import argparse
from pathlib import Path
from datetime import datetime

def convert_file(path_or_url: str, out_dir: str = "core/memory/vault") -> str:
    try:
        from markitdown import MarkItDown
    except ImportError:
        print("[vault-import] markitdown not installed. Run: pip install markitdown", file=sys.stderr)
        sys.exit(1)

    md = MarkItDown()
    print(f"[vault-import] Converting: {path_or_url}", file=sys.stderr)

    result = md.convert(path_or_url)
    content = result.text_content

    if not content.strip():
        print("[vault-import] Empty result", file=sys.stderr)
        return ""

    os.makedirs(out_dir, exist_ok=True)
    name = Path(path_or_url).stem if not path_or_url.startswith("http") else "web-import"
    date = datetime.now().strftime("%Y%m%d")
    out_path = Path(out_dir) / f"{date}-{name}.md"

    header = f"# {name}\n\n> Imported: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n> Source: {path_or_url}\n\n---\n\n"
    out_path.write_text(header + content, encoding="utf-8")

    chars = len(content)
    print(f"[vault-import] Saved: {out_path} ({chars:,} chars)", file=sys.stderr)
    return str(out_path)

def main():
    parser = argparse.ArgumentParser(description="Import file/URL vào YAMTAM vault")
    parser.add_argument("input", nargs="?", help="File path hoặc URL")
    parser.add_argument("--dir", help="Directory để scan")
    parser.add_argument("--ext", default="pdf,docx,pptx,xlsx", help="Extensions (comma-separated)")
    parser.add_argument("--out", default="core/memory/vault", help="Output directory")
    args = parser.parse_args()

    if args.dir:
        exts = [f".{e.strip()}" for e in args.ext.split(",")]
        files = [f for f in Path(args.dir).rglob("*") if f.suffix.lower() in exts]
        print(f"[vault-import] Found {len(files)} files in {args.dir}", file=sys.stderr)
        for f in files:
            convert_file(str(f), args.out)
    elif args.input:
        convert_file(args.input, args.out)
    else:
        parser.print_help()
        sys.exit(1)

if __name__ == "__main__":
    main()

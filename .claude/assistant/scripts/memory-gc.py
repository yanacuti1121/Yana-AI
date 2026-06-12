#!/usr/bin/env python3
"""Memory GC — quét ký ức chết còn sống lang thang (zombie facts).

Chạy mỗi briefing, cùng chỗ với check-milestones.py.

Kiểm tra:
  1. ZOMBIE  — fact đã có tombstone nhưng vẫn xuất hiện như việc đang sống
               trong context.md ("Ưu tiên tiếp theo", blockers) hoặc
               milestones.md (bảng active).
  2. STALE   — context.md quá 3 ngày chưa cập nhật → trạng thái có thể sai.
  3. BLOAT   — memory.md / context.md phình to → gợi ý nén bớt lịch sử.

Không có vấn đề → im lặng (exit 0, không output).
"""

import re
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
TOMBSTONES = ROOT / "tombstones.md"
CONTEXT = ROOT / "context.md"
MILESTONES = ROOT / "milestones.md"
MEMORY = ROOT / "memory.md"

STALE_DAYS = 3
MEMORY_BLOAT_KB = 50
CONTEXT_BLOAT_KB = 12

# Dòng đã tự đánh dấu chết/xong thì không tính là zombie
DEAD_MARKERS = re.compile(r"✅|~~|\bDONE\b|đã xong|đã đóng|đã gỡ|đã fix|lỗi thời", re.IGNORECASE)


def load_tombstones():
    """Trả về list (pattern_compiled, raw_pattern)."""
    if not TOMBSTONES.exists():
        return []
    patterns = []
    for line in TOMBSTONES.read_text().splitlines():
        if not re.match(r"\|\s*\d{4}-\d{2}-\d{2}\s*\|", line):
            continue
        # Tách cột theo "|" KHÔNG bị escape — pattern dùng "\|" cho phép regex alternation
        cells = re.split(r"(?<!\\)\|", line)
        if len(cells) < 3:
            continue
        raw = cells[2].strip()
        raw_regex = raw.replace("\\|", "|")
        try:
            patterns.append((re.compile(raw_regex, re.IGNORECASE), raw))
        except re.error:
            print(f"MEMORY_GC: ⚠ tombstone pattern lỗi regex, bỏ qua: {raw}")
    return patterns


def scan_zombies(patterns):
    """Tìm dòng còn sống khớp tombstone trong context.md + milestones.md."""
    zombies = []
    for f in (CONTEXT, MILESTONES):
        if not f.exists():
            continue
        in_comment = False
        for n, line in enumerate(f.read_text().splitlines(), 1):
            stripped = line.strip()
            # Bỏ qua HTML comment (milestone đã đóng nằm trong <!-- -->)
            if "<!--" in stripped:
                in_comment = "-->" not in stripped
                continue
            if in_comment:
                in_comment = "-->" not in stripped
                continue
            if not stripped or DEAD_MARKERS.search(stripped):
                continue
            for pat, raw in patterns:
                if pat.search(stripped):
                    zombies.append((f.name, n, stripped[:80], raw))
                    break
    return zombies


def check_stale():
    if not CONTEXT.exists():
        return None
    m = re.search(r"Cập nhật lần cuối:\*?\*?\s*(\d{4}-\d{2}-\d{2})", CONTEXT.read_text())
    if not m:
        return None
    try:
        last = datetime.strptime(m.group(1), "%Y-%m-%d").date()
    except ValueError:
        return None
    age = (date.today() - last).days
    return age if age > STALE_DAYS else None


def check_bloat():
    issues = []
    if MEMORY.exists() and MEMORY.stat().st_size > MEMORY_BLOAT_KB * 1024:
        issues.append(f"memory.md {MEMORY.stat().st_size // 1024}KB > {MEMORY_BLOAT_KB}KB — nén các session cũ thành tóm tắt tháng")
    if CONTEXT.exists() and CONTEXT.stat().st_size > CONTEXT_BLOAT_KB * 1024:
        issues.append(f"context.md {CONTEXT.stat().st_size // 1024}KB > {CONTEXT_BLOAT_KB}KB — dọn các mục 'Đã xong' cũ sang memory.md")
    return issues


def main():
    lines = []

    zombies = scan_zombies(load_tombstones())
    for fname, n, text, raw in zombies:
        lines.append(f"  🧟 ZOMBIE {fname}:{n} — \"{text}\" (tombstone: {raw[:40]})")

    age = check_stale()
    if age:
        lines.append(f"  ⏳ STALE — context.md {age} ngày chưa cập nhật, trạng thái có thể sai")

    for b in check_bloat():
        lines.append(f"  📦 BLOAT — {b}")

    if lines:
        print("MEMORY_GC:")
        print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())

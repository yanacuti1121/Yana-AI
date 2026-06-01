#!/usr/bin/env python3
"""Check upcoming milestones and print alerts for idea-loop briefing."""

import re
import sys
from datetime import datetime, date
from pathlib import Path

MILESTONES_FILE = Path(__file__).parent.parent / "milestones.md"

WARN_DAYS  = 7   # yellow alert
URGENT_DAYS = 3  # red alert


def parse_milestones():
    if not MILESTONES_FILE.exists():
        return []
    items = []
    for line in MILESTONES_FILE.read_text().splitlines():
        # Match table rows: | YYYY-MM-DD | Title | Priority |
        m = re.match(r'\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|\s*(P\d)\s*\|', line)
        if not m:
            continue
        try:
            d = datetime.strptime(m.group(1), "%Y-%m-%d").date()
            items.append({"date": d, "title": m.group(2).strip(), "priority": m.group(3)})
        except ValueError:
            continue
    return items


def check():
    milestones = parse_milestones()
    today = date.today()
    alerts = []

    for ms in milestones:
        days_left = (ms["date"] - today).days
        if days_left < 0:
            icon = "⛔"
            label = f"QUÁ HẠN {abs(days_left)} ngày"
        elif days_left == 0:
            icon = "🔴"
            label = "HÔM NAY"
        elif days_left <= URGENT_DAYS:
            icon = "🔴"
            label = f"{days_left} ngày nữa"
        elif days_left <= WARN_DAYS:
            icon = "🟡"
            label = f"{days_left} ngày nữa"
        else:
            continue  # không cần báo

        alerts.append({
            "icon": icon,
            "label": label,
            "title": ms["title"],
            "priority": ms["priority"],
            "days": days_left,
        })

    if not alerts:
        sys.exit(0)  # không có gì → exit 0, không print

    print("MILESTONE_ALERT:")
    for a in sorted(alerts, key=lambda x: x["days"]):
        print(f"  {a['icon']} {a['label']}: {a['title']} ({a['priority']})")


if __name__ == "__main__":
    check()

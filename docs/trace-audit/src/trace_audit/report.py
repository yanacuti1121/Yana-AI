"""Score model + terminal/JSON rendering. Same philosophy as `yana-ai audit`:
start at 100, deterministic penalties, no AI."""
from __future__ import annotations

import json

from .checks import SEVERITY_PENALTY


def score(findings) -> int:
    s = 100
    for f in findings:
        s -= SEVERITY_PENALTY.get(f.severity, 0)
    return max(s, 0)


def trust_label(s: int) -> str:
    if s >= 90:
        return "HIGH"
    if s >= 70:
        return "MEDIUM"
    return "LOW"


def render_terminal(path: str, findings) -> str:
    s = score(findings)
    lines = [
        "Trace Audit Report",
        "──────────────────",
        f"Session: {path}",
        f"Score: {s}/100  |  Trust: {trust_label(s)}",
        "",
    ]
    if not findings:
        lines.append("No findings. The agent's claims are consistent with its actions.")
    for f in findings:
        lines.append(f"[{f.severity:<4}] {f.id} {f.name:<13} — {f.message} (turn {f.turn})")
    return "\n".join(lines)


def render_json(path: str, findings) -> str:
    s = score(findings)
    return json.dumps(
        {
            "session": path,
            "score": s,
            "trust": trust_label(s),
            "findings": [
                {
                    "id": f.id,
                    "name": f.name,
                    "severity": f.severity,
                    "message": f.message,
                    "turn": f.turn,
                }
                for f in findings
            ],
        },
        indent=2,
        ensure_ascii=False,
    )

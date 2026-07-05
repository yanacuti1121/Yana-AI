"""Parse Claude Code session JSONL into a normalized, checkable model.

Deterministic. No LLM. Tolerant to unknown line types: anything that is not
a user/assistant message with content blocks is skipped.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Optional

CODE_EXTS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".rs", ".go", ".java", ".rb",
    ".c", ".cpp", ".cc", ".h", ".hpp", ".cs", ".php", ".swift", ".kt",
    ".sh", ".bash", ".vue", ".astro", ".sql", ".scala", ".ex", ".exs",
}

EDIT_TOOL_NAMES = {
    "edit", "write", "multiedit", "notebookedit", "str_replace",
    "create_file", "apply_patch",
}
BASH_TOOL_NAMES = {"bash", "bash_tool", "shell", "run_terminal_cmd"}

VERIFY_RE = re.compile(
    r"\b(pytest|python3? -m (pytest|unittest)|unittest|npm (run )?test|yarn test|"
    r"pnpm test|jest|vitest|cargo (test|build|check|clippy)|go (test|build|vet)|"
    r"make (test|build|check)|tsc\b|npm run build|next build|eslint|ruff|flake8|"
    r"mypy|phpunit|mvn (test|verify)|gradle(w)? test|rspec|bun test)",
    re.IGNORECASE,
)
TEST_FILE_RE = re.compile(
    r"(^|/)(tests?|__tests__|spec)/|(^|/)test_[^/]+$|_test\.\w+$|\.(test|spec)\.\w+$",
    re.IGNORECASE,
)
EXIT_RE = re.compile(r"exit code[:\s]+(\d+)", re.IGNORECASE)
TRACEBACK_RE = re.compile(r"Traceback \(most recent call last\)|panicked at|FAILED\b")


@dataclass
class ToolUse:
    id: str
    name: str
    input: dict


@dataclass
class ToolResult:
    tool_use_id: str
    text: str
    is_error: bool

    @property
    def looks_failed(self) -> bool:
        if self.is_error:
            return True
        m = EXIT_RE.search(self.text or "")
        if m and int(m.group(1)) != 0:
            return True
        return bool(TRACEBACK_RE.search(self.text or ""))


@dataclass
class Turn:
    index: int
    role: str  # "user" | "assistant"
    text: str = ""
    tool_uses: list = field(default_factory=list)
    tool_results: list = field(default_factory=list)


@dataclass
class Command:
    turn_index: int
    command: str
    result_text: str = ""
    is_error: bool = False
    exit_code: Optional[int] = None

    @property
    def failed(self) -> bool:
        if self.exit_code is not None:
            return self.exit_code != 0
        return self.is_error

    @property
    def is_verify(self) -> bool:
        return bool(VERIFY_RE.search(self.command or ""))


CREATE_TOOL_NAMES = {"write", "create_file"}


@dataclass
class Edit:
    turn_index: int
    file_path: str
    tool: str = ""
    old: str = ""
    new: str = ""

    @property
    def is_new_file(self) -> bool:
        """Write/create-style tools author a new file — adding tests, not tampering."""
        return self.tool in CREATE_TOOL_NAMES

    @property
    def is_test_file(self) -> bool:
        return bool(TEST_FILE_RE.search(self.file_path))

    @property
    def is_code_file(self) -> bool:
        return PurePosixPath(self.file_path).suffix.lower() in CODE_EXTS


@dataclass
class SessionModel:
    path: str
    turns: list
    commands: list
    edits: list

    def assistant_texts(self):
        return [(t.index, t.text) for t in self.turns if t.role == "assistant" and t.text]

    def next_assistant_text_after(self, index: int) -> Optional[tuple]:
        for t in self.turns:
            if t.index > index and t.role == "assistant" and t.text:
                return (t.index, t.text)
        return None


def _blocks(content):
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    if isinstance(content, list):
        return [b for b in content if isinstance(b, dict)]
    return []


def _result_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for b in content:
            if isinstance(b, dict) and b.get("type") == "text":
                parts.append(b.get("text", ""))
            elif isinstance(b, str):
                parts.append(b)
        return "\n".join(parts)
    return ""


def parse_session(path) -> list:
    """Read one JSONL file -> list[Turn]. Unknown/broken lines are skipped."""
    turns = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(entry, dict):
                continue
            msg = entry.get("message")
            if not isinstance(msg, dict):
                continue
            role = msg.get("role") or entry.get("type")
            if role not in ("user", "assistant"):
                continue
            t = Turn(index=len(turns), role=role)
            for b in _blocks(msg.get("content")):
                btype = b.get("type")
                if btype == "text":
                    t.text += b.get("text", "") + "\n"
                elif btype == "tool_use":
                    t.tool_uses.append(
                        ToolUse(b.get("id", ""), b.get("name", ""), b.get("input") or {})
                    )
                elif btype == "tool_result":
                    t.tool_results.append(
                        ToolResult(
                            b.get("tool_use_id", ""),
                            _result_text(b.get("content")),
                            bool(b.get("is_error")),
                        )
                    )
            t.text = t.text.strip()
            turns.append(t)
    return turns


def build_model(path) -> SessionModel:
    turns = parse_session(path)
    pending: dict = {}
    commands: list = []
    edits: list = []
    for t in turns:
        for tu in t.tool_uses:
            name = (tu.name or "").lower()
            if name in BASH_TOOL_NAMES:
                c = Command(t.index, str(tu.input.get("command", "")))
                pending[tu.id] = c
                commands.append(c)
            elif name in EDIT_TOOL_NAMES:
                fp = (
                    tu.input.get("file_path")
                    or tu.input.get("path")
                    or tu.input.get("notebook_path")
                    or ""
                )
                if fp:
                    old = str(tu.input.get("old_string", "") or tu.input.get("old_str", ""))
                    new = str(tu.input.get("new_string", "") or tu.input.get("new_str", ""))
                    for sub in tu.input.get("edits") or []:  # MultiEdit
                        if isinstance(sub, dict):
                            old += "\n" + str(sub.get("old_string", ""))
                            new += "\n" + str(sub.get("new_string", ""))
                    edits.append(Edit(t.index, str(fp), name, old, new))
        for tr in t.tool_results:
            c = pending.get(tr.tool_use_id)
            if c is not None:
                c.result_text = tr.text
                c.is_error = c.is_error or tr.is_error
                m = EXIT_RE.search(tr.text or "")
                if m:
                    c.exit_code = int(m.group(1))
    return SessionModel(str(path), turns, commands, edits)

"""Phần dùng chung của các giai đoạn cài: ngữ cảnh, kết quả, chạy lệnh ngoài. Tách khỏi stages.py để giữ mỗi file dưới giới hạn dòng."""

import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

INSTALL_TIMEOUT_S = 1800  # pip và cargo có thể chạy vài phút
PROBE_TIMEOUT_S = 15
RUSTUP_BASE = "https://static.rust-lang.org/rustup/dist"


@dataclass
class Context:
    home: Path
    source: Optional[Path] = None  # nguồn cục bộ (repo hoặc thư mục yana_ai đã giải nén), dùng khi dev
    runtime_binary: Optional[Path] = None
    runtime_sha256: Optional[str] = None
    package_spec: str = "yana-ai"  # yêu cầu pip, ví dụ "yana-ai==1.5.1"
    requirements: Optional[Path] = None  # file khóa có băm: pip sẽ chạy với --require-hashes
    runtime_version: Optional[str] = None  # phiên bản crates.io cho đường cargo
    rustup_base: str = RUSTUP_BASE  # đổi được để test; chỉ nhận https:// hoặc file://
    prune_rust: bool = False  # xóa luôn toolchain Rust của Yana sau khi build xong (mặc định chỉ dọn bộ nhớ đệm crate)
    project: Optional[Path] = None
    allow_protected_path: bool = False
    dry_run: bool = False
    env: dict = field(default_factory=lambda: dict(os.environ))


def result(stage, ok=True, skipped=False, reason="", **details):
    return {"stage": stage, "ok": ok, "skipped": skipped, "reason": reason, "details": details}


def run_cmd(argv, ctx, timeout=INSTALL_TIMEOUT_S, input_text=None, env=None):
    """Chạy một lệnh với đối số rõ ràng (không qua shell). Trả về (mã thoát, stdout, stderr); lỗi hệ thống thành mã 127 hoặc 124."""
    try:
        done = subprocess.run([str(a) for a in argv], capture_output=True, text=True, timeout=timeout, env=env or ctx.env, input=input_text)
        return done.returncode, done.stdout, done.stderr
    except FileNotFoundError as error:
        return 127, "", str(error)
    except subprocess.TimeoutExpired:
        return 124, "", f"timed out after {timeout}s"
    except OSError as error:
        return 127, "", str(error)


def which(name, ctx):
    return shutil.which(name, path=ctx.env.get("PATH", os.defpath))


def venv_python(ctx):
    return ctx.home / "venv" / ("Scripts" if sys.platform == "win32" else "bin") / ("python.exe" if sys.platform == "win32" else "python")


def package_root(ctx):
    """Thư mục chứa gói (core/, gates/, bin/...): nguồn cục bộ, hoặc `yana_ai` trong môi trường Python của nhà."""
    if ctx.source:
        return ctx.source
    python = venv_python(ctx)
    if not python.exists():
        return None
    code, out, _ = run_cmd([python, "-c", "import os, yana_ai; print(os.path.dirname(yana_ai.__file__))"], ctx, PROBE_TIMEOUT_S)
    return Path(out.strip()) if code == 0 and out.strip() else None

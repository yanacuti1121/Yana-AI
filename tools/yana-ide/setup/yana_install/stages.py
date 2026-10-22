"""Các giai đoạn cài hệ thống Yana vào thư mục nhà. Giao thức giai đoạn học từ scripts/install.sh của Hermes: mỗi giai đoạn
chạy riêng, trả một kết quả JSON, chạy lại an toàn (idempotent).

Nguồn tải (anh Tâm chốt 2026-10-14): phần Python từ PyPI (`yana-ai`), phần Rust từ crates.io (`yana-rt`). Runtime ưu tiên
bản dựng sẵn đi kèm gói PyPI; không có thì `cargo install yana-rt`. Không bao giờ dùng shell=True, không eval.
"""

import json
import os
import platform
import shutil
import sys
import time
from pathlib import Path

from . import seed
from .common import (  # noqa: F401  (re-exported: callers use stages.Context, stages.run_cmd ...)
    INSTALL_TIMEOUT_S, PROBE_TIMEOUT_S, RUSTUP_BASE, Context, package_root, result, run_cmd, venv_python, which,
)
from .toolchain import (  # noqa: F401
    MAX_DOWNLOAD_BYTES, RUST_DIR, choose_runtime, fetch, find_cargo, prebuilt_runtime, prune_own_rust, rust_triple, stage_toolchain,
)

PROTOCOL_VERSION = 1
MARKER_NAME = ".yana-bootstrap-complete"
RUNTIME_RECORD = "runtime.json"
CONFIG_NAME = "config.json"
PACK_DIR = "pack"
PACK_SUBDIRS = ("core", "gates", "scanner", "policy", "adapters", "bin", ".claude-plugin")
MIN_PYTHON = (3, 11)  # yana-ai 1.5.1 on PyPI declares requires_python >=3.11
MIN_FREE_BYTES = 800 * 1024 * 1024  # gói khoảng 64 MB, thêm môi trường Python và chỗ biên dịch Rust
SANDBOX_IMAGE = "yana-ai-sandbox:latest"  # cùng mặc định với core/scripts/sandbox-exec.sh
PROTECTED_PATH_MARKER = "background access is restricted"  # câu lỗi của giamthi_service.py trên macOS
PROJECT_PACK_MARKER = "before installing the supervisor"  # giamthi_service.py đòi dự án đã có .claude/scripts/giamthi-watch.sh
HOME_DIR_MODE = 0o700
SECRET_FILE_MODE = 0o600

# (tên, tiêu đề, nhóm, cần người dùng nhập). Giám Thị cài tự động (anh Tâm chốt), nên không cần nhập.
STAGES = (
    ("prerequisites", "System prerequisites", "runtime", False),
    ("package", "Install the Yana package from PyPI", "runtime", False),
    ("toolchain", "Install the Rust toolchain if it is needed", "runtime", False),
    ("runtime", "Install the Yana runtime (yana-rt)", "runtime", False),
    ("pack", "Install hooks, rules, agents and skills", "runtime", False),
    ("config", "Prepare config", "configuration", False),
    ("integrity", "Verify installed files", "runtime", False),
    ("sandbox", "Check the sandbox", "configuration", False),
    ("supervisor", "Install the Giám Thị supervisor", "configuration", False),
    ("complete", "Finish install", "runtime", False),
)


def manifest():
    return {"protocol_version": PROTOCOL_VERSION, "stages": [
        {"name": n, "title": t, "category": c, "needs_user_input": u} for n, t, c, u in STAGES]}



def nearest_existing(path):
    path = Path(path)
    while not path.exists() and path != path.parent:
        path = path.parent
    return path


def stage_prerequisites(ctx):
    problems = []
    if sys.version_info < MIN_PYTHON:
        problems.append(f"Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]} or newer is required")
    if not which("bash", ctx):
        problems.append("bash is required (the hooks and scripts are bash)")
    free = shutil.disk_usage(nearest_existing(ctx.home)).free
    if free < MIN_FREE_BYTES:
        problems.append(f"at least {MIN_FREE_BYTES // (1024 * 1024)} MB of free disk is needed, found {free // (1024 * 1024)} MB")
    tools = {name: which(name, ctx) for name in ("git", "cargo", "docker")}
    if problems:
        return result("prerequisites", ok=False, reason="; ".join(problems), tools=tools)
    return result("prerequisites", tools=tools, free_mb=free // (1024 * 1024), python=platform.python_version())


def _pip_argv(ctx):
    base = [venv_python(ctx), "-m", "pip", "install", "--disable-pip-version-check"]
    if ctx.requirements:
        return base + ["--require-hashes", "-r", ctx.requirements]
    return base + [ctx.package_spec]


def stage_package(ctx):
    if ctx.source:
        return result("package", skipped=True, reason=f"using the local source {ctx.source}")
    argv = _pip_argv(ctx)
    if ctx.dry_run:
        return result("package", reason="dry run", would_run=[str(a) for a in argv])
    if not venv_python(ctx).exists():
        code, _, err = run_cmd([sys.executable, "-m", "venv", ctx.home / "venv"], ctx, PROBE_TIMEOUT_S * 8)
        if code != 0:
            return result("package", ok=False, reason=f"could not create the Python environment: {err.strip()[-300:]}")
    code, out, err = run_cmd(argv, ctx)
    if code != 0:
        return result("package", ok=False, reason=f"pip install failed: {(err or out).strip()[-400:]}")
    return result("package", package=ctx.package_spec, hashes_required=bool(ctx.requirements))


def stage_runtime(ctx):
    binary, origin, reason = choose_runtime(ctx)
    if binary is None:
        return result("runtime", ok=ctx.dry_run, reason=reason, origin=origin)
    code, out, err = run_cmd([binary, "--version"], ctx, PROBE_TIMEOUT_S)
    if code != 0:
        return result("runtime", ok=False, reason=f"{binary} did not run: {(err or out).strip()[-200:]}")
    digest = seed.file_sha256(binary)
    if ctx.runtime_sha256 and digest != ctx.runtime_sha256.lower():
        return result("runtime", ok=False, reason="the runtime's sha256 does not match the expected value; nothing was installed", sha256=digest)
    if not ctx.dry_run:
        seed.copy_file(binary, ctx.home / "bin" / "yana-rt")
        record = {"sha256": digest, "version": out.strip(), "origin": origin, "installedAt": _now()}
        seed.write_atomic(ctx.home / RUNTIME_RECORD, json.dumps(record, indent=2).encode("utf-8"))
    freed = prune_own_rust(ctx) if origin == "crates.io" and not ctx.dry_run else 0
    return result("runtime", version=out.strip(), origin=origin, sha256=digest, freed_mb=freed // (1024 * 1024))


def stage_pack(ctx):
    root = package_root(ctx)
    if root is None:
        return result("pack", ok=False, reason="the package is not installed yet (the package stage must run first)")
    report = seed.sync(root, ctx.home / PACK_DIR, PACK_SUBDIRS, dry_run=ctx.dry_run)
    counts = report["counts"]
    if sum(counts[k] for k in ("add", "update", "unchanged", "user_modified", "user_deleted", "existing_untracked")) == 0:
        return result("pack", ok=False, reason=f"no pack files found under {root}")
    return result("pack", source=str(root), **report)


def stage_config(ctx):
    created = []
    if not ctx.dry_run:
        for sub in ("logs", "state", "memory"):
            (ctx.home / sub).mkdir(parents=True, exist_ok=True)
        os.chmod(ctx.home, HOME_DIR_MODE)
        config = ctx.home / CONFIG_NAME
        if not config.exists():
            body = {"version": 1, "pack": {"apply": "ask"}, "supervisor": {"auto": True}, "components": {}}
            seed.write_atomic(config, json.dumps(body, indent=2).encode("utf-8"), SECRET_FILE_MODE)
            created.append(CONFIG_NAME)
    return result("config", created=created, home=str(ctx.home))


def stage_integrity(ctx):
    pack = ctx.home / PACK_DIR
    if not (pack / seed.MANIFEST_NAME).exists():
        return result("integrity", skipped=True, reason="the pack is not installed yet")
    drift = seed.drift(pack)
    record_file = ctx.home / RUNTIME_RECORD
    binary = ctx.home / "bin" / "yana-rt"
    if record_file.exists() and binary.exists():
        recorded = json.loads(record_file.read_text(encoding="utf-8")).get("sha256")
        if recorded != seed.file_sha256(binary):
            return result("integrity", ok=False, reason="the installed yana-rt changed since it was installed", pack=drift)
    return result("integrity", pack=drift)


def stage_sandbox(ctx):
    docker = which("docker", ctx)
    if not docker:
        return result("sandbox", skipped=True, reason="Docker is not installed: approved commands will run with resource limits only, with no file or network isolation", docker="not installed")
    code, out, _ = run_cmd([docker, "info", "--format", "{{.ServerVersion}}"], ctx, PROBE_TIMEOUT_S)
    if code != 0 or not out.strip():
        return result("sandbox", skipped=True, reason="the Docker daemon is not running: start Docker Desktop, then run setup again", docker="installed, not running")
    image = run_cmd([docker, "image", "inspect", SANDBOX_IMAGE], ctx, PROBE_TIMEOUT_S)[0] == 0
    return result("sandbox", docker=f"running {out.strip()}", image="present" if image else "not built", reason="" if image else f"the image {SANDBOX_IMAGE} is not built yet")


def stage_supervisor(ctx):
    if ctx.project is None:
        return result("supervisor", skipped=True, reason="no project folder given: Giám Thị is installed per project, automatically, when a folder is opened")
    script = ctx.home / PACK_DIR / "core" / "scripts" / "giamthi_service.py"
    if not script.exists():
        return result("supervisor", ok=False, reason="the pack is not installed yet")
    python = venv_python(ctx) if venv_python(ctx).exists() else sys.executable
    argv = [python, script] + (["--dry-run"] if ctx.dry_run else []) + ["--json"] + (["--allow-protected-path"] if ctx.allow_protected_path else []) + ["install", ctx.project]
    code, out, err = run_cmd(argv, ctx, PROBE_TIMEOUT_S * 8)
    message = (err or out).strip()
    if code == 0:
        return result("supervisor", project=str(ctx.project), output=out.strip()[-400:])
    if PROTECTED_PATH_MARKER in message:
        return result("supervisor", skipped=True, reason=message.splitlines()[-1][:300], needs="full-disk-access-or-move", project=str(ctx.project))
    if PROJECT_PACK_MARKER in message:
        return result("supervisor", skipped=True, reason="this project does not have the Yana scripts yet (yana-ai install <project> must run first)", needs="project-pack", project=str(ctx.project))
    return result("supervisor", ok=False, reason=f"giamthi install failed: {message[-300:]}")


def stage_complete(ctx):
    if ctx.dry_run:
        return result("complete", reason="dry run: the completion marker would be written here")
    pack = ctx.home / PACK_DIR
    if not (ctx.home / RUNTIME_RECORD).exists() or not (pack / seed.MANIFEST_NAME).exists():
        return result("complete", ok=False, reason="the runtime or the pack is not installed")
    marker = {"completedAt": _now(), "protocol_version": PROTOCOL_VERSION,
              "runtime": json.loads((ctx.home / RUNTIME_RECORD).read_text(encoding="utf-8")),
              "packFiles": len(seed.read_manifest(pack / seed.MANIFEST_NAME))}
    if not ctx.dry_run:
        seed.write_atomic(ctx.home / MARKER_NAME, json.dumps(marker, indent=2).encode("utf-8"))
    return result("complete", **marker)


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


STAGE_FUNCS = {
    "prerequisites": stage_prerequisites, "package": stage_package, "toolchain": stage_toolchain, "runtime": stage_runtime, "pack": stage_pack,
    "config": stage_config, "integrity": stage_integrity, "sandbox": stage_sandbox, "supervisor": stage_supervisor,
    "complete": stage_complete,
}


def run_stage(name, ctx):
    """Chạy một giai đoạn; mọi lỗi hệ thống thành kết quả thất bại có lý do, không làm sập bộ cài."""
    func = STAGE_FUNCS.get(name)
    if func is None:
        return result(name, ok=False, reason=f"unknown stage '{name}'")
    try:
        return func(ctx)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return result(name, ok=False, reason=f"{type(error).__name__}: {error}")


def status(home):
    """Trạng thái cài đặt của một thư mục nhà, chỉ đọc."""
    home = Path(home)
    info = {"home": str(home), "installed": (home / MARKER_NAME).exists(), "runtime": None, "pack": None, "completedAt": None}
    try:
        if (home / MARKER_NAME).exists():
            info["completedAt"] = json.loads((home / MARKER_NAME).read_text(encoding="utf-8")).get("completedAt")
        if (home / RUNTIME_RECORD).exists():
            info["runtime"] = json.loads((home / RUNTIME_RECORD).read_text(encoding="utf-8"))
        if (home / PACK_DIR / seed.MANIFEST_NAME).exists():
            info["pack"] = seed.drift(home / PACK_DIR)
    except (OSError, ValueError) as error:
        info["error"] = f"{type(error).__name__}: {error}"
    return info

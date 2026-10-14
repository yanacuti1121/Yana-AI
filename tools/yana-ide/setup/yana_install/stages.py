"""Các giai đoạn cài hệ thống Yana vào thư mục nhà. Giao thức giai đoạn học từ scripts/install.sh của Hermes: mỗi giai đoạn
chạy riêng, trả một kết quả JSON, chạy lại an toàn (idempotent).

Nguồn tải (anh Tâm chốt 2026-10-14): phần Python từ PyPI (`yana-ai`), phần Rust từ crates.io (`yana-rt`). Runtime ưu tiên
bản dựng sẵn đi kèm gói PyPI; không có thì `cargo install yana-rt`. Không bao giờ dùng shell=True, không eval.
"""

import json
import os
import platform
import shutil
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from . import seed

PROTOCOL_VERSION = 1
MARKER_NAME = ".yana-bootstrap-complete"
RUNTIME_RECORD = "runtime.json"
CONFIG_NAME = "config.json"
PACK_DIR = "pack"
PACK_SUBDIRS = ("core", "gates", "scanner", "policy", "adapters", "bin", ".claude-plugin")
MIN_PYTHON = (3, 11)  # yana-ai 1.5.1 on PyPI declares requires_python >=3.11
MIN_FREE_BYTES = 800 * 1024 * 1024  # gói khoảng 64 MB, thêm môi trường Python và chỗ biên dịch Rust
INSTALL_TIMEOUT_S = 1800  # pip và cargo có thể chạy vài phút
PROBE_TIMEOUT_S = 15
SANDBOX_IMAGE = "yana-ai-sandbox:latest"  # cùng mặc định với core/scripts/sandbox-exec.sh
PROTECTED_PATH_MARKER = "background access is restricted"  # câu lỗi của giamthi_service.py trên macOS
RUSTUP_BASE = "https://static.rust-lang.org/rustup/dist"
RUSTUP_TRIPLES = {
    ("darwin", "arm64"): "aarch64-apple-darwin", ("darwin", "x86_64"): "x86_64-apple-darwin",
    ("linux", "x86_64"): "x86_64-unknown-linux-gnu", ("linux", "aarch64"): "aarch64-unknown-linux-gnu",
}
MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024  # rustup-init khoảng 20 MB; trần này chỉ để chặn tải vô tận
DOWNLOAD_TIMEOUT_S = 120
RUST_DIR = "rust"  # CARGO_HOME và RUSTUP_HOME của Yana nằm trong đây, tách khỏi Rust của người dùng
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


def manifest():
    return {"protocol_version": PROTOCOL_VERSION, "stages": [
        {"name": n, "title": t, "category": c, "needs_user_input": u} for n, t, c, u in STAGES]}


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


def prebuilt_runtime(root):
    arch = platform.machine().lower()
    arch = "x86_64" if arch in ("amd64", "x86_64") else arch
    name = f"yana-rt-{sys.platform}-{arch}" + (".exe" if sys.platform == "win32" else "")
    path = Path(root) / "bin" / name if root else None
    return path if path and path.is_file() else None


def _cargo_build(ctx):
    """Biên dịch yana-rt từ crates.io vào <nhà>/cargo. Trả về (đường dẫn hoặc None, lý do lỗi)."""
    cargo, overlay = find_cargo(ctx)
    if not cargo:
        return None, "no prebuilt yana-rt in the package and no Rust toolchain: the toolchain stage installs one automatically, run setup again"
    argv = [cargo, "install", "yana-rt", "--locked", "--root", ctx.home / "cargo"]
    if ctx.runtime_version:
        argv += ["--version", ctx.runtime_version]
    code, out, err = run_cmd(argv, ctx, env={**ctx.env, **overlay})
    built = ctx.home / "cargo" / "bin" / "yana-rt"
    if code != 0 or not built.is_file():
        return None, f"cargo install yana-rt failed: {(err or out).strip()[-400:]}"
    return built, ""


def choose_runtime(ctx):
    """(đường dẫn, nguồn, lý do lỗi). Thứ tự: chỉ định tay, bản dựng sẵn trong gói PyPI, biên dịch từ crates.io."""
    if ctx.runtime_binary:
        return Path(ctx.runtime_binary), "explicit", ""
    prebuilt = prebuilt_runtime(package_root(ctx))
    if prebuilt:
        return prebuilt, "pypi-wheel", ""
    if ctx.dry_run:
        return None, "crates.io", "dry run: would run cargo install yana-rt"
    built, reason = _cargo_build(ctx)
    return built, "crates.io", reason


def rust_triple():
    machine = platform.machine().lower()
    machine = "x86_64" if machine in ("amd64", "x86_64") else machine
    return RUSTUP_TRIPLES.get((sys.platform, machine))


def find_cargo(ctx):
    """(đường dẫn cargo, biến môi trường bổ sung). Rust của người dùng trên PATH được ưu tiên; không có thì dùng bản của Yana trong nhà."""
    on_path = which("cargo", ctx)
    if on_path:
        return on_path, {}
    own = ctx.home / RUST_DIR / "cargo" / "bin" / "cargo"
    if own.is_file():
        return str(own), {"CARGO_HOME": str(ctx.home / RUST_DIR / "cargo"), "RUSTUP_HOME": str(ctx.home / RUST_DIR / "rustup")}
    return None, {}


def fetch(url, dest):
    """Tải một file nhỏ về `dest`. Chỉ https (hoặc file:// cho test), có trần dung lượng. Ném ValueError nếu không hợp lệ."""
    if not url.startswith(("https://", "file://")):
        raise ValueError(f"refusing to download from {url.split(':')[0]}://, only https is allowed")
    total = 0
    with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT_S) as response, open(dest, "wb") as out:
        for chunk in iter(lambda: response.read(seed.HASH_CHUNK), b""):
            total += len(chunk)
            if total > MAX_DOWNLOAD_BYTES:
                raise ValueError(f"download from {url} is larger than {MAX_DOWNLOAD_BYTES // (1024 * 1024)} MB, stopped")
            out.write(chunk)


def _fetch_verified_rustup(ctx, triple):
    """Tải rustup-init và file băm chính thức của nó, đối chiếu sha256. Trả về đường dẫn file đã kiểm, hoặc ném ValueError."""
    cache = ctx.home / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    binary, checksum = cache / "rustup-init", cache / "rustup-init.sha256"
    base = f"{ctx.rustup_base}/{triple}/rustup-init"
    fetch(base, binary)
    fetch(base + ".sha256", checksum)
    expected = checksum.read_text(encoding="utf-8").split()[0].lower()
    actual = seed.file_sha256(binary)
    if actual != expected:
        binary.unlink()
        raise ValueError(f"rustup-init sha256 {actual} does not match the published {expected}; nothing was run")
    os.chmod(binary, seed.EXEC_MODE)
    return binary


def _working_cc(ctx):
    cc = which("cc", ctx)
    return bool(cc) and run_cmd([cc, "--version"], ctx, PROBE_TIMEOUT_S)[0] == 0


def stage_toolchain(ctx):
    if ctx.runtime_binary:
        return result("toolchain", skipped=True, reason="an explicit runtime was given, nothing to build")
    if prebuilt_runtime(package_root(ctx)):
        return result("toolchain", skipped=True, reason="the package ships a prebuilt yana-rt, no Rust needed")
    cargo, _ = find_cargo(ctx)
    if cargo:
        return result("toolchain", skipped=True, reason=f"Rust is already available at {cargo}")
    triple = rust_triple()
    if triple is None:
        return result("toolchain", ok=False, reason=f"no Rust installer is known for {sys.platform}/{platform.machine()}; install Rust yourself, then run setup again")
    if not _working_cc(ctx):
        return result("toolchain", ok=False, reason="a C compiler is needed to build yana-rt and none works; on macOS run `xcode-select --install`, then run setup again")
    url = f"{ctx.rustup_base}/{triple}/rustup-init"
    if ctx.dry_run:
        return result("toolchain", reason="dry run: Rust would be installed into the Yana folder", would_download=url, into=str(ctx.home / RUST_DIR))
    binary = _fetch_verified_rustup(ctx, triple)
    overlay = {"CARGO_HOME": str(ctx.home / RUST_DIR / "cargo"), "RUSTUP_HOME": str(ctx.home / RUST_DIR / "rustup")}
    code, out, err = run_cmd([binary, "-y", "--profile", "minimal", "--default-toolchain", "stable", "--no-modify-path"], ctx, env={**ctx.env, **overlay})
    if code != 0:
        return result("toolchain", ok=False, reason=f"rustup-init failed: {(err or out).strip()[-400:]}")
    cargo, overlay = find_cargo(ctx)
    version = run_cmd([cargo, "--version"], ctx, PROBE_TIMEOUT_S, env={**ctx.env, **overlay})[1].strip() if cargo else ""
    if not version:
        return result("toolchain", ok=False, reason="rustup-init finished but cargo does not run")
    return result("toolchain", cargo=version, into=str(ctx.home / RUST_DIR), url=url)


def _inside(path, parent):
    path, parent = Path(path).resolve(), Path(parent).resolve()
    return path == parent or parent in path.parents


def prune_own_rust(ctx):
    """Dọn bộ nhớ đệm crate (tải lại được) trong Rust của Yana; với prune_rust thì xóa cả toolchain. Trả về số byte giải phóng.

    Chỉ chạm vào <nhà>/rust. Rust của người dùng (cargo trên PATH, ~/.cargo) không bao giờ bị đụng tới.
    """
    own = ctx.home / RUST_DIR
    if not own.is_dir() or not _inside(own, ctx.home) or which("cargo", ctx):
        return 0
    targets = [own] if ctx.prune_rust else [own / "cargo" / "registry"]
    freed = 0
    for target in targets:
        if target.is_dir() and not target.is_symlink() and _inside(target, own):
            freed += sum(f.stat().st_size for f in target.rglob("*") if f.is_file() and not f.is_symlink())
            shutil.rmtree(target)
    return freed


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

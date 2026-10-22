"""Lấy runtime yana-rt: bản dựng sẵn trong gói, hoặc biên dịch từ crates.io bằng Rust (có thể tự cài Rust vào thư mục nhà, có kiểm sha256).
Tách khỏi stages.py. Không bao giờ chạm vào Rust của người dùng."""

import os
import platform
import shutil
import sys
import urllib.request
from pathlib import Path

from . import seed
from .common import PROBE_TIMEOUT_S, package_root, result, run_cmd, which

RUSTUP_TRIPLES = {
    ("darwin", "arm64"): "aarch64-apple-darwin", ("darwin", "x86_64"): "x86_64-apple-darwin",
    ("linux", "x86_64"): "x86_64-unknown-linux-gnu", ("linux", "aarch64"): "aarch64-unknown-linux-gnu",
}
MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024  # rustup-init khoảng 20 MB; trần này chỉ để chặn tải vô tận
DOWNLOAD_TIMEOUT_S = 120
RUST_DIR = "rust"  # CARGO_HOME và RUSTUP_HOME của Yana nằm trong đây, tách khỏi Rust của người dùng


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

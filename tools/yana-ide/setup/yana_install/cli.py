"""Dòng lệnh của bộ cài hệ thống Yana. Giao thức giống scripts/install.sh của Hermes:

    --manifest                    in danh sách giai đoạn dạng JSON
    --stage NAME [--json]         chạy một giai đoạn
    (không có --stage)            chạy lần lượt mọi giai đoạn, dừng ở giai đoạn đầu tiên thất bại
    --status                      trạng thái cài đặt hiện tại (chỉ đọc)

Mã thoát: 0 thành công (giai đoạn bị bỏ qua vẫn là thành công), 1 có giai đoạn thất bại, 2 sai tham số.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

from . import stages

EXIT_OK, EXIT_FAILED, EXIT_USAGE = 0, 1, 2


def build_parser():
    parser = argparse.ArgumentParser(prog="yana-system-install", description="Install the Yana system into ~/.yana")
    parser.add_argument("--manifest", action="store_true", help="print the stage list as JSON")
    parser.add_argument("--stage", choices=[name for name, *_ in stages.STAGES], help="run one stage")
    parser.add_argument("--status", action="store_true", help="print the install status as JSON")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--non-interactive", action="store_true", help="never ask questions (this installer never asks)")
    parser.add_argument("--dry-run", action="store_true", help="show what would happen, change nothing")
    parser.add_argument("--home", help="install folder (default: $YANA_HOME or ~/.yana)")
    parser.add_argument("--source", help="local package folder (repo checkout or unpacked yana_ai), instead of PyPI")
    parser.add_argument("--runtime-binary", help="use this yana-rt instead of the packaged or crates.io one")
    parser.add_argument("--runtime-sha256", help="refuse any yana-rt whose sha256 differs")
    parser.add_argument("--package", default="yana-ai", help="pip requirement for the PyPI package, e.g. yana-ai==1.5.1")
    parser.add_argument("--requirements", help="hashed pip lock file; installs with --require-hashes")
    parser.add_argument("--runtime-version", help="crates.io version of yana-rt for the cargo path")
    parser.add_argument("--prune-rust", action="store_true", help="after building yana-rt, delete the Rust toolchain Yana installed (re-installed automatically on update)")
    parser.add_argument("--rustup-base", default=stages.RUSTUP_BASE, help=argparse.SUPPRESS)  # chỉ để test
    parser.add_argument("--project", help="project folder to install the Giám Thị supervisor for")
    parser.add_argument("--allow-protected-path", action="store_true", help="retry the supervisor after granting Full Disk Access")
    return parser


def resolve_home(raw, source):
    """Thư mục nhà đã kiểm tra, hoặc ValueError. Từ chối thư mục gốc, thư mục cá nhân, và chỗ chồng lên nguồn."""
    home = Path(os.path.expanduser(raw or os.environ.get("YANA_HOME") or "~/.yana")).resolve()
    user_home = Path.home().resolve()
    if home == Path(home.anchor) or home == user_home or home in user_home.parents:
        raise ValueError(f"refusing to install into {home}")
    if home.exists() and not home.is_dir():
        raise ValueError(f"{home} exists and is not a folder")
    if source:
        src = Path(source).resolve()
        if home == src or home in src.parents or src in home.parents:
            raise ValueError("the install folder and the source folder must not contain each other")
    return home


def build_context(args, home):
    optional = lambda value: Path(value).resolve() if value else None
    return stages.Context(
        home=home, source=optional(args.source), runtime_binary=optional(args.runtime_binary), runtime_sha256=args.runtime_sha256,
        package_spec=args.package, requirements=optional(args.requirements), runtime_version=args.runtime_version, rustup_base=args.rustup_base, prune_rust=args.prune_rust,
        project=optional(args.project), allow_protected_path=args.allow_protected_path, dry_run=args.dry_run,
    )


def emit(outcome, as_json, log):
    line = json.dumps(outcome, ensure_ascii=False)
    if log is not None:
        log.write(line + "\n")
        log.flush()
    if as_json:
        print(line, flush=True)
        return
    mark = "skipped" if outcome["skipped"] else ("ok" if outcome["ok"] else "FAILED")
    print(f"[{mark}] {outcome['stage']}: {outcome['reason'] or 'done'}", flush=True)


def open_log(ctx):
    if ctx.dry_run:
        return None
    (ctx.home / "logs").mkdir(parents=True, exist_ok=True)
    os.chmod(ctx.home, stages.HOME_DIR_MODE)
    return open(ctx.home / "logs" / f"install-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.log", "a", encoding="utf-8")


def run(args, ctx):
    names = [args.stage] if args.stage else [name for name, *_ in stages.STAGES]
    log = open_log(ctx)
    try:
        for name in names:
            outcome = stages.run_stage(name, ctx)
            emit(outcome, args.json, log)
            if not outcome["ok"]:
                return EXIT_FAILED
    finally:
        if log is not None:
            log.close()
    return EXIT_OK


def main(argv=None):
    args = build_parser().parse_args(argv)
    if args.manifest:
        print(json.dumps(stages.manifest()))
        return EXIT_OK
    try:
        home = resolve_home(args.home, args.source)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return EXIT_USAGE
    if args.status:
        print(json.dumps(stages.status(home), ensure_ascii=False))
        return EXIT_OK
    return run(args, build_context(args, home))

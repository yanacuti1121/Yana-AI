"""Chép gói Yana vào thư mục nhà theo bảng băm, cùng ý với tools/skills_sync.py của Hermes.

Quy tắc (theo từng file, so sánh nội dung bằng sha256, không so ngày giờ):
  - File mới (nguồn có, bảng chưa có, đích chưa có): chép và ghi vào bảng.
  - File đã có trong bảng: chỉ cập nhật khi nguồn đổi VÀ bản trong nhà còn y như lúc chép (người dùng chưa sửa).
  - Người dùng đã sửa: giữ nguyên bản của họ, không đè.
  - Người dùng đã xóa: không chép lại.
  - Đích đã có sẵn nhưng bảng chưa biết (không phải do ta chép): không đụng, không ghi vào bảng.
Chỉ dùng thư viện chuẩn. Không theo symlink, không bao giờ ghi ra ngoài thư mục đích.
"""

import hashlib
import os
import shutil
from pathlib import Path

MANIFEST_NAME = ".bundled_manifest"
EXCLUDED_NAMES = {"__pycache__", ".git", "node_modules", ".DS_Store", ".pytest_cache"}
# Trạng thái của người dùng (tóm tắt phiên, nhật ký agent, nhật ký audit, điểm tin cậy) không phải một phần của gói; nó nằm trong
# state/ của thư mục nhà. Hai file mã trong core/memory (secure-logger.js, trust-ledger.js) vẫn thuộc gói. Cùng danh sách với pyproject.toml.
DEFAULT_EXCLUDED_PREFIXES = (
    "core/memory/L2_session/", "core/memory/agent-journals/", "core/memory/audit/", "core/memory/trust-ledger.json", "core/tests/",
)
EXEC_MODE = 0o755
FILE_MODE = 0o644
HASH_CHUNK = 1 << 20
TMP_SUFFIX = ".yana-tmp"


def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(HASH_CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iter_source(source_root, subdirs, exclude=DEFAULT_EXCLUDED_PREFIXES):
    """Các file thường dưới `source_root/<subdir>`: (đường dẫn tương đối dạng 'subdir/...', đường dẫn thật). Bỏ symlink."""
    for sub in subdirs:
        base = Path(source_root) / sub
        if not base.is_dir() or base.is_symlink():
            continue
        for current, dirs, names in os.walk(base):
            dirs[:] = sorted(d for d in dirs if d not in EXCLUDED_NAMES and not Path(current, d).is_symlink())
            for name in sorted(names):
                full = Path(current, name)
                if name in EXCLUDED_NAMES or full.is_symlink() or not full.is_file():
                    continue
                rel = full.relative_to(source_root).as_posix()
                if not rel.startswith(tuple(exclude)):
                    yield rel, full


def read_manifest(path):
    entries = {}
    try:
        text = Path(path).read_text(encoding="utf-8")
    except FileNotFoundError:
        return entries
    for line in text.splitlines():
        rel, sep, digest = line.rpartition(":")
        if sep and rel and len(digest) == 64 and all(c in "0123456789abcdef" for c in digest):
            entries[rel] = digest
    return entries


def write_atomic(path, data, mode=FILE_MODE):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + TMP_SUFFIX)
    tmp.write_bytes(data)
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def write_manifest(path, entries):
    body = "".join(f"{rel}:{digest}\n" for rel, digest in sorted(entries.items()))
    write_atomic(path, body.encode("utf-8"))


def safe_dest(dest_root, rel):
    """Đường đích cho `rel`, hoặc ValueError nếu nó thoát ra ngoài `dest_root` (kể cả qua symlink có sẵn).

    Phần đã tồn tại của đường dẫn được giải symlink; phần chưa tồn tại được nối lại vào sau, rồi so với thư mục đích.
    """
    parts = Path(rel).parts
    if ".." in parts or Path(rel).is_absolute() or not parts:
        raise ValueError(f"unsafe path in package: {rel}")
    root = Path(dest_root).resolve()
    dest = root / rel
    existing, tail = dest.parent, []
    while not existing.exists():
        tail.append(existing.name)
        existing = existing.parent
    resolved = existing.resolve().joinpath(*reversed(tail))
    if resolved != root and root not in resolved.parents:
        raise ValueError(f"path leaves the install folder: {rel}")
    return dest


def copy_file(src, dest):
    mode = EXEC_MODE if os.stat(src).st_mode & 0o111 else FILE_MODE
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + TMP_SUFFIX)
    shutil.copyfile(src, tmp)
    os.chmod(tmp, mode)
    os.replace(tmp, dest)


def _decide(src_hash, recorded, dest):
    """Một trong: add, update, unchanged, user_modified, user_deleted, existing_untracked."""
    if recorded is None:
        return "existing_untracked" if dest.exists() else "add"
    if not dest.exists():
        return "user_deleted"
    if file_sha256(dest) != recorded:
        return "user_modified"
    return "unchanged" if src_hash == recorded else "update"


def sync(source_root, dest_root, subdirs, dry_run=False):
    """Đồng bộ nguồn vào đích. Trả về báo cáo {đếm theo loại, danh sách file bị giữ lại}."""
    dest_root = Path(dest_root)
    manifest_path = dest_root / MANIFEST_NAME
    manifest = read_manifest(manifest_path)
    counts = {key: 0 for key in ("add", "update", "unchanged", "user_modified", "user_deleted", "existing_untracked", "orphaned")}
    kept = []
    seen = set()
    for rel, src in iter_source(source_root, subdirs):
        seen.add(rel)
        dest = safe_dest(dest_root, rel)
        src_hash = file_sha256(src)
        action = _decide(src_hash, manifest.get(rel), dest)
        counts[action] += 1
        if action in ("user_modified", "existing_untracked"):
            kept.append(rel)
        if action in ("add", "update") and not dry_run:
            copy_file(src, dest)
            manifest[rel] = src_hash
        elif action in ("add", "update"):
            manifest[rel] = src_hash
    for rel in sorted(set(manifest) - seen):
        if (dest_root / rel).exists():
            counts["orphaned"] += 1
        elif not dry_run:
            del manifest[rel]
    if not dry_run:
        write_manifest(manifest_path, manifest)
    return {"counts": counts, "kept": kept[:50], "kept_total": len(kept), "tracked": len(manifest)}


def drift(dest_root):
    """So từng file trong bảng với bản đang nằm trong nhà: số file nguyên vẹn, đã sửa, đã mất."""
    dest_root = Path(dest_root)
    manifest = read_manifest(dest_root / MANIFEST_NAME)
    result = {"tracked": len(manifest), "intact": 0, "modified": 0, "missing": 0, "modified_files": []}
    for rel, digest in manifest.items():
        dest = dest_root / rel
        if not dest.exists():
            result["missing"] += 1
        elif file_sha256(dest) == digest:
            result["intact"] += 1
        else:
            result["modified"] += 1
            result["modified_files"].append(rel)
    result["modified_files"] = result["modified_files"][:50]
    return result

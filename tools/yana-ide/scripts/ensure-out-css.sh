#!/usr/bin/env bash
# Đảm bảo có out/vs/workbench/workbench.desktop.main.css trong một checkout VS Code của Yana Studio.
# Dùng: tools/yana-ide/scripts/ensure-out-css.sh <đường dẫn checkout vscode> [--force]
#
# Vì sao cần: app mở từ Dock hoặc Finder chạy kiểu đóng gói và bắt buộc có file CSS này. Lệnh dựng đầy đủ
# (`npm run compile-client`, `gulp compile`) xoá out/ rồi không sinh lại nó, nên cửa sổ chỉ hiện nền đen
# (log: "Failed to load resource .../workbench.desktop.main.css net::ERR_FILE_NOT_FOUND").
# Script dựng CSS bằng bước `bundle` của build/next vào một thư mục tạm NGOÀI checkout, rồi chép đúng một file.
# Chạy lại nhiều lần được. Không đụng file nào khác trong out/.
set -euo pipefail

VSCODE_DIR="${1:?usage: ensure-out-css.sh <vscode checkout> [--force]}"
FORCE="${2:-}"
VSCODE_DIR="$(cd "$VSCODE_DIR" && pwd)"
CSS_REL="out/vs/workbench/workbench.desktop.main.css"
CSS_FILE="$VSCODE_DIR/$CSS_REL"

if [[ "$FORCE" != "--force" && -s "$CSS_FILE" ]]; then
	echo "[yana-ide] $CSS_REL already present"
	exit 0
fi
if [[ ! -f "$VSCODE_DIR/build/next/index.ts" ]]; then
	echo "[yana-ide] $VSCODE_DIR has no build/next/index.ts: not a VS Code checkout this script knows" >&2
	exit 1
fi
if [[ ! -d "$VSCODE_DIR/out/vs/workbench" ]]; then
	echo "[yana-ide] out/ is missing: run the build first (for example: node build/next/index.ts build-fast)" >&2
	exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yana-css-XXXXXX")"
cleanup() {
	find "$TMP_DIR" -mindepth 1 -delete 2>/dev/null || true
	rmdir "$TMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT

# `--out` is resolved against the checkout root, so pass a path relative to it. An absolute path would be
# appended to the checkout and leave a stray directory inside it.
BUNDLE_REL="$(python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$TMP_DIR/out" "$VSCODE_DIR")"
(cd "$VSCODE_DIR" && node build/next/index.ts bundle --out "$BUNDLE_REL" >/dev/null)

BUILT="$TMP_DIR/out/vs/workbench/workbench.desktop.main.css"
if [[ ! -s "$BUILT" ]]; then
	echo "[yana-ide] bundle finished but produced no workbench.desktop.main.css" >&2
	exit 1
fi
cp "$BUILT" "$CSS_FILE"
echo "[yana-ide] restored $CSS_REL ($(wc -c < "$CSS_FILE" | tr -d ' ') bytes)"

#!/usr/bin/env bash
# Áp phần riêng của Yana Studio lên một bản checkout VS Code đúng commit trong upstream.lock.
# Dùng: tools/yana-ide/scripts/prepare.sh <đường dẫn checkout vscode>
# Chạy lại nhiều lần được: mỗi lần khôi phục các file upstream mà script này sửa rồi áp lại.
set -euo pipefail

IDE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VSCODE_DIR="${1:?usage: prepare.sh <vscode checkout>}"
VSCODE_DIR="$(cd "$VSCODE_DIR" && pwd)"

expected_commit="$(grep '^commit=' "$IDE_DIR/upstream.lock" | cut -d= -f2)"
actual_commit="$(git -C "$VSCODE_DIR" rev-parse HEAD)"
if [[ "$actual_commit" != "$expected_commit" ]]; then
	echo "[yana-ide] upstream commit $actual_commit khác lock $expected_commit" >&2
	exit 1
fi

# Extension upstream không nạp trong Yana Studio (gắn với dịch vụ Microsoft).
# Không xoá thư mục: chỉ đổi tên package.json để bộ quét extension bỏ qua.
removed_extensions=()
while IFS= read -r name; do
	[[ -n "$name" ]] && removed_extensions+=("$name")
done < "$IDE_DIR/removed-extensions.txt"

# Khôi phục đúng những file upstream mà patch, product.json và danh sách trên đụng tới.
ICON_FILE="resources/darwin/code.icns"
touched_files=("product.json" "$ICON_FILE")
WATERMARK_DIR="src/vs/workbench/browser/parts/editor/media"
for variant in dark light hcDark hcLight; do
	touched_files+=("$WATERMARK_DIR/letterpress-$variant.svg")
done
for name in "${removed_extensions[@]}"; do
	touched_files+=("extensions/$name/package.json")
done
for patch in "$IDE_DIR"/patches/*.patch; do
	while IFS= read -r file; do
		touched_files+=("$file")
	done < <(git -C "$VSCODE_DIR" apply --numstat "$patch" | cut -f3)
done
for name in "${removed_extensions[@]}"; do
	disabled="$VSCODE_DIR/extensions/$name/package.json.yana-disabled"
	[[ -f "$disabled" ]] && mv "$disabled" "$VSCODE_DIR/extensions/$name/package.json"
done
git -C "$VSCODE_DIR" checkout -- "${touched_files[@]}"

# Ngoài các file vừa khôi phục, checkout phải sạch (trừ extension của mình và đồ build).
unexpected="$(git -C "$VSCODE_DIR" status --porcelain --untracked-files=no)"
if [[ -n "$unexpected" ]]; then
	echo "[yana-ide] checkout upstream có thay đổi lạ, dừng lại:" >&2
	echo "$unexpected" >&2
	exit 1
fi

for patch in "$IDE_DIR"/patches/*.patch; do
	git -C "$VSCODE_DIR" apply "$patch"
	echo "[yana-ide] applied $(basename "$patch")"
done

for name in "${removed_extensions[@]}"; do
	mv "$VSCODE_DIR/extensions/$name/package.json" "$VSCODE_DIR/extensions/$name/package.json.yana-disabled"
	echo "[yana-ide] disabled extension $name"
done

# Hình mờ giữa vùng editor khi chưa mở file: thay logo VS Code bằng thỏ Yana (branding/letterpress-*.svg).
for variant in dark light hcDark hcLight; do
	cp "$IDE_DIR/branding/letterpress-$variant.svg" "$VSCODE_DIR/$WATERMARK_DIR/letterpress-$variant.svg"
done
echo "[yana-ide] replaced editor watermark"

# Icon app macOS: thay icon VS Code bằng thỏ Yana (branding/yana.icns, sinh từ scripts/make-icon.swift).
cp "$IDE_DIR/branding/yana.icns" "$VSCODE_DIR/$ICON_FILE"
echo "[yana-ide] replaced app icon"

node "$IDE_DIR/scripts/merge-product.mjs" "$VSCODE_DIR/product.json" "$IDE_DIR/product.overrides.json"

for ext in "$IDE_DIR"/extensions/*/; do
	name="$(basename "$ext")"
	mkdir -p "$VSCODE_DIR/extensions/$name"
	# --delete: file đã xoá ở bản gốc cũng phải biến mất khỏi bản build. .claude/ là trạng thái hook cục bộ, không thuộc extension.
	rsync -a --delete --exclude '.claude/' "$ext" "$VSCODE_DIR/extensions/$name/"
	echo "[yana-ide] copied extension $name"
done

echo "[yana-ide] prepare done for $expected_commit"

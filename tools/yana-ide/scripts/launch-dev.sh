#!/usr/bin/env bash
# Mở Yana Studio ở chế độ phát triển từ một checkout VS Code của Yana Studio.
# Dùng: tools/yana-ide/scripts/launch-dev.sh <đường dẫn checkout vscode> [thư mục hoặc tham số của app...]
#
# Chế độ phát triển nạp CSS theo từng module nên KHÔNG cần out/vs/workbench/workbench.desktop.main.css, và không đen
# khi ai đó dựng lại out/. Các biến môi trường giống scripts/code.sh của VS Code; mở app thẳng từ Dock hoặc Finder
# thì không có các biến này.
set -euo pipefail

VSCODE_DIR="${1:?usage: launch-dev.sh <vscode checkout> [folder or app arguments...]}"
shift
VSCODE_DIR="$(cd "$VSCODE_DIR" && pwd)"
APP="$VSCODE_DIR/.build/electron/Yana Studio.app/Contents/MacOS/Yana Studio"

if [[ ! -x "$APP" ]]; then
	echo "[yana-ide] $APP not found or not executable" >&2
	exit 1
fi
if [[ ! -f "$VSCODE_DIR/out/main.js" ]]; then
	echo "[yana-ide] $VSCODE_DIR/out/main.js is missing: build first (node build/next/index.ts build-fast)" >&2
	exit 1
fi

cd "$VSCODE_DIR"
export NODE_ENV=development
export VSCODE_DEV=1
export VSCODE_CLI=1
export ELECTRON_ENABLE_STACK_DUMPING=1
exec "$APP" . --disable-extension=vscode.vscode-api-tests "$@"

#!/usr/bin/env bash
# Đóng gói các màn React của app Yana Studio cũ (tools/yana-studio/renderer) cho webview của IDE.
# Ghi ra extensions/yana-agent/media/studio/. Dùng Vite và node_modules sẵn có của tools/yana-studio.
# Cần chạy lại mỗi khi sửa tools/yana-ide/studio-web/* hoặc các màn cũ được dùng, trước prepare.sh.
set -euo pipefail
IFS=$'\n\t'

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
studio="$here/../../yana-studio"
web="$here/../studio-web"

if [[ ! -x "$studio/node_modules/.bin/vite" ]]; then
	echo "[yana-ide] missing $studio/node_modules (run npm ci in tools/yana-studio first)" >&2
	exit 1
fi

cd "$web"
"$studio/node_modules/.bin/vite" build --config vite.config.mjs
echo "[yana-ide] studio web screens built"

#!/usr/bin/env bash
# Build yana-rt as a WebAssembly module via wasm-pack.
# Output: pkg/  → yana_rt.js + yana_rt_bg.wasm + yana_rt.d.ts
#
# Usage:
#   bash scripts/build-wasm.sh          # web target (ES module, for browsers/bundlers)
#   bash scripts/build-wasm.sh nodejs   # CommonJS target (for Node.js)
#   bash scripts/build-wasm.sh bundler  # for webpack/vite/rollup

set -euo pipefail

TARGET="${1:-web}"

if ! command -v wasm-pack &>/dev/null; then
  echo "[yana-rt/wasm] wasm-pack not found — installing..."
  # SECURITY FIX (2026-07-12, dogfooding CI setup —
  # docs/Yana-AI-Danh-gia-Kien-truc-Bao-mat.md section 3.5 #31): download
  # first, then execute as a separate step, per this repo's own
  # 44-supply-chain-vetting.md / anti-evasion-law.md — never pipe a remote
  # script straight into a shell, even for a well-known installer.
  WASM_PACK_INSTALLER="$(mktemp)"
  trap 'rm -f "$WASM_PACK_INSTALLER"' EXIT
  curl -sSf -o "$WASM_PACK_INSTALLER" https://rustwasm.github.io/wasm-pack/installer/init.sh
  sh "$WASM_PACK_INSTALLER"
fi

echo "[yana-rt/wasm] building for target: $TARGET"
wasm-pack build \
  --target "$TARGET" \
  --out-dir pkg \
  --no-default-features \
  --features wasm

echo ""
echo "[yana-rt/wasm] done → pkg/"
echo "  yana_rt.js        JS bindings (ES module)"
echo "  yana_rt_bg.wasm   compiled WebAssembly"
echo "  yana_rt.d.ts      TypeScript types"
echo ""
echo "Usage in browser:"
echo "  import init, { check_command } from './pkg/yana_rt.js';"
echo "  await init();"
echo "  const r = JSON.parse(check_command('rm -rf /'));"
echo "  // → { allowed: false, reason: \"Blocked: 'rm -rf'...\" }"

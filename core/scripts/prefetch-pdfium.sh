#!/usr/bin/env bash
# Prefetches the pdfium binary that liteparse-pdfium-sys's build script
# downloads at build time (this crate is pulled in by the default "cli"
# feature via liteparse, so it runs on nearly every cargo build/test).
#
# The build script's own downloader uses ureq/rustls and has been observed
# failing in CI with a transient TLS handshake error:
#   "invalid peer certificate: Other(OtherError(UnsupportedCertVersion))"
# and it cannot be used at all behind a proxy whose CA the crate does not
# trust. curl uses the system TLS stack instead, sidestepping both. Running
# this first means the build script's own download path is never reached:
# it checks its cache dir before downloading (liteparse-pdfium-sys's
# build.rs, resolve_pdfium_dirs()).
#
# Usage:
#   bash core/scripts/prefetch-pdfium.sh
#   PDFIUM_TARGET=x86_64-apple-darwin bash core/scripts/prefetch-pdfium.sh
#
# PDFIUM_TARGET is the Rust target triple the build is for (default: this
# machine). build.rs picks the asset from the TARGET, not from the machine it
# runs on, so a cross build (x86_64-apple-darwin on an arm64 runner) needs it.
#
# The download is checked against the SHA-256 pinned below, so a changed or
# tampered release asset fails the step instead of being compiled in. When
# PDFIUM_TAG changes, replace the four digests (curl each asset, sha256sum it).
# On macOS the dylib's install name is rewritten to @rpath/libpdfium.dylib,
# exactly as build.rs does after its own download.
#
# Windows and other targets are skipped: build.rs downloads for them itself.
#
# Without network access, set PDFIUM_LIB_PATH and PDFIUM_INCLUDE_PATH to an
# extracted pdfium (lib/ and include/) instead; build.rs honours them first.
# See CONTRIBUTING.md, "Building without network access to GitHub".
set -euo pipefail

PDFIUM_TAG="chromium/7847"
PDFIUM_TAG_SAFE="chromium_7847"

sha256_of() {
  case "$1" in
    pdfium-linux-x64)   echo "3e8326bc517d071c569efc23f6e18d60a83c7b775c714bb571c609fffebd5320" ;;
    pdfium-linux-arm64) echo "9fc1c556fb5b9764f9f6f474161d871776c25a507cb82ba25006beb658c29cea" ;;
    pdfium-mac-arm64)   echo "38f3c04decee8304283b0e779d520d7ff40d3ceafd93eaf4eb07cd73be34481a" ;;
    pdfium-mac-x64)     echo "f72f89d175c16cc692fa1218aa777270faaac054be351ce40185cbedb0c4280f" ;;
    *) return 1 ;;
  esac
}

actual_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Same mapping as liteparse-pdfium-sys's pdfium_asset_stem(), for the targets
# this script can fetch.
target="${PDFIUM_TARGET:-}"
if [[ -z "$target" ]]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64)  target="aarch64-apple-darwin" ;;
    Darwin-x86_64) target="x86_64-apple-darwin" ;;
    Linux-x86_64)  target="x86_64-unknown-linux-gnu" ;;
    Linux-aarch64) target="aarch64-unknown-linux-gnu" ;;
    *) echo "prefetch-pdfium: unsupported host $(uname -s)-$(uname -m), skipping" >&2; exit 0 ;;
  esac
fi

case "$target" in
  aarch64-apple-darwin)                               asset="pdfium-mac-arm64";   os="mac" ;;
  x86_64-apple-darwin)                                asset="pdfium-mac-x64";     os="mac" ;;
  x86_64-unknown-linux-gnu|x86_64-unknown-linux-musl) asset="pdfium-linux-x64";   os="linux" ;;
  aarch64-unknown-linux-gnu|aarch64-unknown-linux-musl) asset="pdfium-linux-arm64"; os="linux" ;;
  *) echo "prefetch-pdfium: target $target is not prefetched here (build.rs downloads it), skipping" >&2; exit 0 ;;
esac

# build.rs looks in the cache of the machine it runs on (XDG_CACHE_HOME, else
# ~/Library/Caches on a macOS host, else ~/.cache), whatever the target is.
if [[ -n "${XDG_CACHE_HOME:-}" ]]; then
  cache_base="$XDG_CACHE_HOME"
elif [[ "$(uname -s)" == "Darwin" ]]; then
  cache_base="$HOME/Library/Caches"
else
  cache_base="$HOME/.cache"
fi

dest="$cache_base/pdfium-rs/$PDFIUM_TAG_SAFE/$asset"

if [[ -d "$dest/lib" && -d "$dest/include" ]]; then
  echo "prefetch-pdfium: already cached at $dest"
  exit 0
fi

expected="$(sha256_of "$asset")" || { echo "prefetch-pdfium: no pinned SHA-256 for $asset" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

encoded_tag="${PDFIUM_TAG//\//%2F}"
url="https://github.com/run-llama/pdfium-binaries/releases/download/${encoded_tag}/${asset}.tgz"
echo "prefetch-pdfium: fetching $url"
curl -fsSL --retry 5 --retry-all-errors --connect-timeout 10 "$url" -o "$tmp/pdfium.tgz"

actual="$(actual_sha256 "$tmp/pdfium.tgz")"
if [[ "$actual" != "$expected" ]]; then
  echo "prefetch-pdfium: SHA-256 mismatch for $asset" >&2
  echo "  expected $expected" >&2
  echo "  actual   $actual" >&2
  exit 1
fi

mkdir -p "$tmp/extract"
tar -xzf "$tmp/pdfium.tgz" -C "$tmp/extract"
rm -f "$tmp/pdfium.tgz"

if [[ "$os" == "mac" && -f "$tmp/extract/lib/libpdfium.dylib" ]]; then
  if command -v install_name_tool >/dev/null 2>&1; then
    install_name_tool -id "@rpath/libpdfium.dylib" "$tmp/extract/lib/libpdfium.dylib"
  else
    echo "prefetch-pdfium: install_name_tool not found; the dylib keeps its original install name" >&2
  fi
fi

mkdir -p "$(dirname "$dest")"
rm -rf "$dest"
mv "$tmp/extract" "$dest"

echo "prefetch-pdfium: cached at $dest"

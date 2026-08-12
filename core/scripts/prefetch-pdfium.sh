#!/usr/bin/env bash
# Prefetches the pdfium binary that liteparse-pdfium-sys's build script
# downloads at build time (this crate is pulled in by the default "cli"
# feature via liteparse, so it runs on nearly every cargo build/test).
#
# The build script's own downloader uses ureq/rustls and has been observed
# failing in CI with a transient TLS handshake error:
#   "invalid peer certificate: Other(OtherError(UnsupportedCertVersion))"
# curl uses the system TLS stack instead, sidestepping that failure mode.
# Running this first means the build script's own download path is never
# reached — it checks its cache dir before downloading (see
# liteparse-pdfium-sys's build.rs, resolve_pdfium_dirs()).
set -euo pipefail

PDFIUM_TAG="chromium/7847"
PDFIUM_TAG_SAFE="chromium_7847"

case "$(uname -s)" in
  Darwin)
    cache_base="$HOME/Library/Caches"
    case "$(uname -m)" in
      arm64)  asset="pdfium-mac-arm64" ;;
      x86_64) asset="pdfium-mac-x64" ;;
      *) echo "prefetch-pdfium: unsupported macOS arch $(uname -m), skipping" >&2; exit 0 ;;
    esac
    ;;
  Linux)
    cache_base="${XDG_CACHE_HOME:-$HOME/.cache}"
    case "$(uname -m)" in
      x86_64)  asset="pdfium-linux-x64" ;;
      aarch64) asset="pdfium-linux-arm64" ;;
      *) echo "prefetch-pdfium: unsupported Linux arch $(uname -m), skipping" >&2; exit 0 ;;
    esac
    ;;
  *)
    echo "prefetch-pdfium: unsupported OS $(uname -s), skipping" >&2
    exit 0
    ;;
esac

dest="$cache_base/pdfium-rs/$PDFIUM_TAG_SAFE/$asset"

if [[ -d "$dest/lib" && -d "$dest/include" ]]; then
  echo "prefetch-pdfium: already cached at $dest"
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

encoded_tag="${PDFIUM_TAG//\//%2F}"
url="https://github.com/run-llama/pdfium-binaries/releases/download/${encoded_tag}/${asset}.tgz"
echo "prefetch-pdfium: fetching $url"
curl -fsSL --retry 5 --retry-all-errors --connect-timeout 10 "$url" -o "$tmp/pdfium.tgz"
tar -xzf "$tmp/pdfium.tgz" -C "$tmp"
rm -f "$tmp/pdfium.tgz"

mkdir -p "$(dirname "$dest")"
rm -rf "$dest"
mv "$tmp" "$dest"

echo "prefetch-pdfium: cached at $dest"

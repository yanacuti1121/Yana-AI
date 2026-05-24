#!/usr/bin/env bash
# YAMTAM ENGINE — One-line installer
# Usage: curl -sSL https://raw.githubusercontent.com/phamlongh230-lgtm/yamtam-engine/main/install.sh | bash
#
# Options (env vars):
#   YAMTAM_DIR       — install target (default: .claude in current dir)
#   YAMTAM_SKIP_TEST — set to 1 to skip post-install verification

set -euo pipefail

REPO="phamlongh230-lgtm/yamtam-engine"
INSTALL_DIR="${YAMTAM_DIR:-.claude}"
SKIP_TEST="${YAMTAM_SKIP_TEST:-0}"
TMP_ZIP="$(mktemp /tmp/yamtam-XXXXXX.zip)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

banner() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║        YAMTAM ENGINE INSTALLER       ║"
  echo "  ║  Personal Agent OS for Claude Code   ║"
  echo "  ╚══════════════════════════════════════╝"
  echo -e "${NC}"
}

info()    { echo -e "  ${CYAN}→${NC} $*"; }
success() { echo -e "  ${GREEN}✓${NC} $*"; }
warn()    { echo -e "  ${YELLOW}⚠${NC}  $*"; }
fail()    { echo -e "  ${RED}✗${NC} $*"; exit 1; }

check_deps() {
  local missing=()
  for cmd in curl unzip jq; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    fail "Missing required tools: ${missing[*]}. Install them and retry."
  fi
  success "Dependencies OK (curl, unzip, jq)"
}

download() {
  info "Fetching latest release info..."
  local api_url="https://api.github.com/repos/$REPO/releases/latest"
  local RELEASE_URL
  RELEASE_URL=$(curl -fsSL "$api_url" 2>/dev/null \
    | grep '"browser_download_url"' \
    | grep '\.zip' \
    | head -1 \
    | grep -o 'https://[^"]*')

  if [[ -z "$RELEASE_URL" ]]; then
    fail "Could not find release zip. Check your internet connection or https://github.com/$REPO/releases"
  fi

  info "Downloading $(basename "$RELEASE_URL")..."
  if ! curl -fsSL "$RELEASE_URL" -o "$TMP_ZIP" 2>/dev/null; then
    fail "Download failed. Check your internet connection."
  fi
  local size
  size=$(du -sh "$TMP_ZIP" | cut -f1)
  success "Downloaded ($size)"
}

install_files() {
  info "Installing to ${BOLD}$INSTALL_DIR/${NC}..."
  mkdir -p "$INSTALL_DIR"
  unzip -q -o "$TMP_ZIP" -d "$INSTALL_DIR"
  rm -f "$TMP_ZIP"

  # Make all hooks executable
  find "$INSTALL_DIR/hooks" -type f \( -name "*.sh" -o -name "*.js" \) -exec chmod +x {} \;
  success "Files installed → $INSTALL_DIR/"
}

apply_claude_md() {
  local src="$INSTALL_DIR/CLAUDE.md"
  local dst="$(pwd)/CLAUDE.md"

  if [[ ! -f "$src" ]]; then
    warn "CLAUDE.md not found in install dir — skipping"
    return
  fi

  # Skip if YAMTAM block already present
  if [[ -f "$dst" ]] && grep -q "YAMTAM ENGINE" "$dst" 2>/dev/null; then
    success "CLAUDE.md already contains YAMTAM block — skipped"
    return
  fi

  info "Applying YAMTAM config to CLAUDE.md..."
  if [[ -f "$dst" ]]; then
    # Append with a blank separator
    { echo ""; cat "$src"; } >> "$dst"
  else
    cp "$src" "$dst"
  fi
  success "CLAUDE.md updated → $(pwd)/CLAUDE.md"
}

verify() {
  if [[ "$SKIP_TEST" == "1" ]]; then
    warn "Skipping verification (YAMTAM_SKIP_TEST=1)"
    return
  fi

  local test_script="$INSTALL_DIR/tests/hooks/run-hook-tests.sh"
  if [[ ! -f "$test_script" ]]; then
    warn "Test script not found — skipping verification"
    return
  fi

  info "Running 826-check verification suite..."
  if bash "$test_script" --quiet 2>/dev/null | grep -q "All.*passed"; then
    success "All checks passed ✓"
  else
    warn "Some checks failed — run manually: bash $test_script"
  fi
}

print_done() {
  echo ""
  echo -e "  ${GREEN}${BOLD}YAMTAM ENGINE installed successfully!${NC}"
  echo ""
  echo -e "  ${CYAN}→${NC} Open Claude Code in this directory — hooks are active."
  echo -e "  ${CYAN}→${NC} Docs: https://github.com/$REPO"
  echo ""
}

main() {
  banner
  check_deps
  download
  install_files
  apply_claude_md
  verify
  print_done
}

main "$@"

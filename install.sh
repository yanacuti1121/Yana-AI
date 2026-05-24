#!/usr/bin/env bash
# YAMTAM ENGINE — One-line installer
# Usage: curl -sSL https://raw.githubusercontent.com/phamlongh230-lgtm/yamtam-engine/main/install.sh | bash
#
# Options (env vars):
#   YAMTAM_DIR   — install target (default: .claude in current dir)
#   YAMTAM_SKIP_TEST — set to 1 to skip post-install verification

set -euo pipefail

REPO="phamlongh230-lgtm/yamtam-engine"
RELEASE_URL="https://github.com/$REPO/releases/latest/download/yamtam-engine-latest.zip"
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
  info "Downloading latest release..."
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

print_next_steps() {
  echo ""
  echo -e "${BOLD}  Next steps:${NC}"
  echo ""
  echo "  1. Add YAMTAM hooks to your Claude settings:"
  echo "     ${CYAN}cat $INSTALL_DIR/CLAUDE.md >> \$(pwd)/CLAUDE.md${NC}"
  echo ""
  echo "  2. Verify all checks pass:"
  echo "     ${CYAN}bash $INSTALL_DIR/tests/hooks/run-hook-tests.sh${NC}"
  echo ""
  echo "  3. Read the docs:"
  echo "     ${CYAN}https://github.com/$REPO${NC}"
  echo ""
  echo -e "  ${GREEN}${BOLD}YAMTAM ENGINE installed successfully!${NC}"
  echo ""
}

main() {
  banner
  check_deps
  download
  install_files
  verify
  print_next_steps
}

main "$@"

#!/usr/bin/env bash
# Yana AI — One-line installer
# Usage: curl -sSL https://raw.githubusercontent.com/yanacuti1121/yana-ai/main/install.sh | bash
#
# Options (env vars):
#   YANA_DIR       — install target (default: .claude in current dir)
#   YANA_SKIP_TEST — set to 1 to skip post-install verification

set -euo pipefail

REPO="yanacuti1121/yana-ai"
INSTALL_DIR="${YANA_DIR:-.claude}"
SKIP_TEST="${YANA_SKIP_TEST:-0}"
TMP_ZIP="$(mktemp /tmp/yana-ai-XXXXXX.zip)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

VI="${YANA_LANG:-$(locale 2>/dev/null | grep LANG | head -1 | grep -qi 'vi' && echo vi || echo en)}"
[[ "$VI" == "vi" ]] || VI="${LANG:-en}"; [[ "$VI" == vi* ]] && VI=vi || VI=en

banner() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  if [[ "$VI" == "vi" ]]; then
    echo "  ╔══════════════════════════════════════╗"
    echo "  ║       BỘ CÀI Yana AI           ║"
    echo "  ║   Hệ điều hành Agent cho Claude Code ║"
    echo "  ╚══════════════════════════════════════╝"
  else
    echo "  ╔══════════════════════════════════════╗"
    echo "  ║        Yana AI INSTALLER       ║"
    echo "  ║  Personal Agent OS for Claude Code   ║"
    echo "  ╚══════════════════════════════════════╝"
  fi
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
    [[ "$VI" == "vi" ]] \
      && fail "Thiếu công cụ cần thiết: ${missing[*]}. Hãy cài chúng và thử lại." \
      || fail "Missing required tools: ${missing[*]}. Install them and retry."
  fi
  [[ "$VI" == "vi" ]] && success "Kiểm tra phụ thuộc OK (curl, unzip, jq)" \
                       || success "Dependencies OK (curl, unzip, jq)"
}

download() {
  [[ "$VI" == "vi" ]] && info "Đang lấy thông tin release mới nhất..." \
                       || info "Fetching latest release info..."
  local api_url="https://api.github.com/repos/$REPO/releases/latest"
  local RELEASE_URL
  RELEASE_URL=$(curl -fsSL "$api_url" 2>/dev/null \
    | grep '"browser_download_url"' \
    | grep '\.zip' \
    | head -1 \
    | grep -o 'https://[^"]*')

  if [[ -z "$RELEASE_URL" ]]; then
    [[ "$VI" == "vi" ]] \
      && fail "Không tìm thấy file zip. Kiểm tra kết nối mạng hoặc https://github.com/$REPO/releases" \
      || fail "Could not find release zip. Check your internet connection or https://github.com/$REPO/releases"
  fi

  [[ "$VI" == "vi" ]] && info "Đang tải $(basename "$RELEASE_URL")..." \
                       || info "Downloading $(basename "$RELEASE_URL")..."
  if ! curl -fsSL "$RELEASE_URL" -o "$TMP_ZIP" 2>/dev/null; then
    [[ "$VI" == "vi" ]] && fail "Tải xuống thất bại. Kiểm tra kết nối mạng." \
                         || fail "Download failed. Check your internet connection."
  fi
  local size
  size=$(du -sh "$TMP_ZIP" | cut -f1)
  [[ "$VI" == "vi" ]] && success "Đã tải xong ($size)" || success "Downloaded ($size)"
}

install_files() {
  [[ "$VI" == "vi" ]] && info "Đang cài vào ${BOLD}$INSTALL_DIR/${NC}..." \
                       || info "Installing to ${BOLD}$INSTALL_DIR/${NC}..."
  mkdir -p "$INSTALL_DIR"
  unzip -q -o "$TMP_ZIP" -d "$INSTALL_DIR"
  rm -f "$TMP_ZIP"

  find "$INSTALL_DIR/hooks" -type f \( -name "*.sh" -o -name "*.js" \) -exec chmod +x {} \;
  [[ "$VI" == "vi" ]] && success "Đã cài xong → $INSTALL_DIR/" \
                       || success "Files installed → $INSTALL_DIR/"
}

apply_claude_md() {
  local src="$INSTALL_DIR/CLAUDE.md"
  local dst="$(pwd)/CLAUDE.md"

  if [[ ! -f "$src" ]]; then
    [[ "$VI" == "vi" ]] && warn "Không tìm thấy CLAUDE.md trong thư mục cài — bỏ qua" \
                         || warn "CLAUDE.md not found in install dir — skipping"
    return
  fi

  if [[ -f "$dst" ]] && grep -q "Yana AI" "$dst" 2>/dev/null; then
    [[ "$VI" == "vi" ]] && success "CLAUDE.md đã có block Yana AI — bỏ qua" \
                         || success "CLAUDE.md already contains Yana AI block — skipped"
    return
  fi

  [[ "$VI" == "vi" ]] && info "Đang áp cấu hình Yana AI vào CLAUDE.md..." \
                       || info "Applying Yana AI config to CLAUDE.md..."
  if [[ -f "$dst" ]]; then
    { echo ""; cat "$src"; } >> "$dst"
  else
    cp "$src" "$dst"
  fi
  [[ "$VI" == "vi" ]] && success "Đã cập nhật CLAUDE.md → $(pwd)/CLAUDE.md" \
                       || success "CLAUDE.md updated → $(pwd)/CLAUDE.md"
}

verify() {
  if [[ "$SKIP_TEST" == "1" ]]; then
    [[ "$VI" == "vi" ]] && warn "Bỏ qua kiểm tra (YANA_SKIP_TEST=1)" \
                         || warn "Skipping verification (YANA_SKIP_TEST=1)"
    return
  fi

  local test_script="$INSTALL_DIR/tests/hooks/run-hook-tests.sh"
  if [[ ! -f "$test_script" ]]; then
    [[ "$VI" == "vi" ]] && warn "Không tìm thấy script kiểm tra — bỏ qua" \
                         || warn "Test script not found — skipping verification"
    return
  fi

  [[ "$VI" == "vi" ]] && info "Đang chạy bộ kiểm tra 826 checks..." \
                       || info "Running 826-check verification suite..."
  if bash "$test_script" --quiet 2>/dev/null | grep -q "All.*passed"; then
    [[ "$VI" == "vi" ]] && success "Tất cả checks đạt ✓" || success "All checks passed ✓"
  else
    [[ "$VI" == "vi" ]] && warn "Một số checks thất bại — chạy thủ công: bash $test_script" \
                         || warn "Some checks failed — run manually: bash $test_script"
  fi
}

print_done() {
  echo ""
  if [[ "$VI" == "vi" ]]; then
    echo -e "  ${GREEN}${BOLD}Yana AI đã cài thành công!${NC}"
    echo ""
    echo -e "  ${CYAN}→${NC} Mở Claude Code trong thư mục này — hooks đã hoạt động."
    echo -e "  ${CYAN}→${NC} Tài liệu: https://github.com/$REPO"
  else
    echo -e "  ${GREEN}${BOLD}Yana AI installed successfully!${NC}"
    echo ""
    echo -e "  ${CYAN}→${NC} Open Claude Code in this directory — hooks are active."
    echo -e "  ${CYAN}→${NC} Docs: https://github.com/$REPO"
  fi
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

#!/usr/bin/env bash
# Yana AI - SBOM Generator
# Hook: PostToolUse (fires after tool execution)
# Purpose: Generate Software Bill of Materials after dependency installations
# Date: 2026-05-23

set -euo pipefail

# Configuration
SBOM_DIR="${CLAUDE_STATE_DIR:-.claude/state}/sbom"
AUDIT_LOG="${CLAUDE_STATE_DIR:-.claude/state}/audit.log"
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"

# Bypass for testing
if [[ "${YANA_SBOM_BYPASS:-0}" == "1" ]]; then
  exit 0
fi

# Log SBOM generation
log_sbom() {
  local ecosystem="$1"
  local file="$2"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  echo "${timestamp}|${SESSION_ID}|sbom-generator|INFO|Generated SBOM for ${ecosystem}: ${file}" >> "$AUDIT_LOG"
}

# Generate npm SBOM
generate_npm_sbom() {
  local project_root="$1"
  local output_file="${SBOM_DIR}/sbom-npm.json"

  if [[ -f "${project_root}/package.json" ]]; then
    echo "Generating npm SBOM..." >&2

    # Use cyclonedx-npm if available
    if command -v npx &>/dev/null; then
      npx --yes @cyclonedx/cyclonedx-npm \
        --output-file "$output_file" \
        --package-lock-only \
        2>/dev/null || {
        echo "Warning: cyclonedx-npm failed, using fallback" >&2
        # Fallback: simple package list
        jq -r '.dependencies // {} | keys[]' "${project_root}/package.json" > "${output_file}.txt"
      }
    else
      # Fallback: extract from package.json
      jq -r '.dependencies // {} | to_entries[] | "\(.key)@\(.value)"' \
        "${project_root}/package.json" > "${output_file}.txt"
    fi

    log_sbom "npm" "$output_file"
    return 0
  fi

  return 1
}

# Generate Python SBOM
generate_python_sbom() {
  local project_root="$1"
  local output_file="${SBOM_DIR}/sbom-python.json"

  if [[ -f "${project_root}/requirements.txt" ]] || [[ -f "${project_root}/pyproject.toml" ]]; then
    echo "Generating Python SBOM..." >&2

    # Use pip-audit if available
    if command -v pip-audit &>/dev/null; then
      pip-audit --format cyclonedx --output "$output_file" 2>/dev/null || {
        echo "Warning: pip-audit failed, using fallback" >&2
        # Fallback: pip freeze
        pip freeze > "${output_file}.txt" 2>/dev/null || true
      }
    else
      # Fallback: requirements.txt
      if [[ -f "${project_root}/requirements.txt" ]]; then
        cp "${project_root}/requirements.txt" "${output_file}.txt"
      fi
    fi

    log_sbom "python" "$output_file"
    return 0
  fi

  return 1
}

# Generate Rust SBOM
generate_rust_sbom() {
  local project_root="$1"
  local output_file="${SBOM_DIR}/sbom-rust.json"

  if [[ -f "${project_root}/Cargo.toml" ]]; then
    echo "Generating Rust SBOM..." >&2

    # Use cargo-sbom if available
    if command -v cargo &>/dev/null && cargo install --list | grep -q cargo-sbom; then
      cargo sbom --output-format json > "$output_file" 2>/dev/null || {
        echo "Warning: cargo-sbom failed, using fallback" >&2
        # Fallback: Cargo.lock
        if [[ -f "${project_root}/Cargo.lock" ]]; then
          cp "${project_root}/Cargo.lock" "${output_file}.txt"
        fi
      }
    else
      # Fallback: extract from Cargo.toml
      if [[ -f "${project_root}/Cargo.lock" ]]; then
        grep -A 2 '^\[\[package\]\]' "${project_root}/Cargo.lock" > "${output_file}.txt"
      fi
    fi

    log_sbom "rust" "$output_file"
    return 0
  fi

  return 1
}

# Detect install commands and trigger SBOM generation
detect_install_command() {
  local tool_name="$1"
  local tool_input="$2"

  # Check if this is an install command
  case "$tool_name" in
    Bash)
      if echo "$tool_input" | grep -qE '(npm|yarn|pnpm) install|pip install|cargo install'; then
        return 0
      fi
      ;;
  esac

  return 1
}

# Main execution
main() {
  local tool_name="${TOOL_NAME:-}"
  local tool_input="${TOOL_INPUT:-}"
  local project_root="${PWD}"

  # Only run on install commands
  if ! detect_install_command "$tool_name" "$tool_input"; then
    exit 0
  fi

  # Create SBOM directory
  mkdir -p "$SBOM_DIR"

  # Generate SBOMs for detected ecosystems
  local generated=0

  generate_npm_sbom "$project_root" && ((generated++)) || true
  generate_python_sbom "$project_root" && ((generated++)) || true
  generate_rust_sbom "$project_root" && ((generated++)) || true

  if [[ $generated -gt 0 ]]; then
    echo "✓ Generated $generated SBOM(s) in ${SBOM_DIR}/" >&2
  fi

  exit 0
}

# Run main
main "$@"

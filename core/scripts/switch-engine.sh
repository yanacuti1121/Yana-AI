#!/usr/bin/env bash
# Switch active AI engine adapter
# Usage: bash core/scripts/switch-engine.sh <claude|cursor|copilot|aider>
set -euo pipefail

ENGINE="${1:-}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

usage() {
  echo "Usage: $0 <engine>"
  echo ""
  echo "Engines:"
  echo "  claude   — default (no adapter needed, uses .claude/ hooks natively)"
  echo "  cursor   — activates .cursorrules + .cursor/rules/*.mdc"
  echo "  copilot  — activates .github/copilot-instructions.md"
  echo "  aider    — prints aider CLI command with system prompt"
  echo "  status   — show which adapters are currently active"
  exit 1
}

[[ -z "$ENGINE" ]] && usage

case "$ENGINE" in
  claude)
    echo -e "${GREEN}Claude Code (native) — no adapter needed.${NC}"
    echo "Hooks in core/hooks/ are enforced at runtime via .claude/settings.json"
    echo "Run: bash core/tests/hooks/run-hook-tests.sh to verify"
    ;;

  cursor)
    if [[ -f ".cursorrules" ]]; then
      echo -e "${GREEN}✓ .cursorrules present${NC} ($(wc -l < .cursorrules) lines)"
    else
      echo -e "${RED}✗ .cursorrules missing — regenerate:${NC}"
      echo "  bash core/scripts/switch-engine.sh cursor --regen"
    fi
    if [[ -d ".cursor/rules" ]]; then
      echo -e "${GREEN}✓ .cursor/rules/ present${NC} ($(ls .cursor/rules/*.mdc 2>/dev/null | wc -l) rules)"
    fi
    echo ""
    echo -e "${CYAN}Cursor picks up these files automatically.${NC}"
    echo "No action needed — open the project in Cursor."
    ;;

  copilot)
    INSTRUCTIONS=".github/copilot-instructions.md"
    if [[ -f "$INSTRUCTIONS" ]]; then
      echo -e "${GREEN}✓ $INSTRUCTIONS present${NC} ($(wc -l < "$INSTRUCTIONS") lines)"
    else
      echo -e "${RED}✗ $INSTRUCTIONS missing${NC}"
      exit 1
    fi
    echo ""
    echo -e "${CYAN}GitHub Copilot reads this file automatically in VS Code.${NC}"
    echo "Ensure: GitHub Copilot extension ≥ 1.100 for instructions support."
    ;;

  aider)
    ADAPTER="adapters/aider.md"
    if [[ ! -f "$ADAPTER" ]]; then
      echo -e "${RED}✗ $ADAPTER missing${NC}"
      exit 1
    fi
    echo -e "${GREEN}✓ Aider adapter ready${NC}"
    echo ""
    echo -e "${CYAN}Run aider with YAMTAM governance:${NC}"
    echo ""
    echo "  aider --system-prompt $ADAPTER --model claude-3-5-sonnet"
    echo ""
    echo "Or add to .aider.conf.yml:"
    echo "  system_prompt: $ADAPTER"
    echo "  auto_commits: false"
    ;;

  status)
    echo "=== YAMTAM Engine Adapter Status ==="
    echo ""
    [[ -f ".cursorrules" ]] \
      && echo -e "  ${GREEN}✓${NC} Cursor    .cursorrules ($(wc -l < .cursorrules) lines)" \
      || echo -e "  ${YELLOW}✗${NC} Cursor    .cursorrules missing"
    [[ -d ".cursor/rules" ]] \
      && echo -e "  ${GREEN}✓${NC} Cursor    .cursor/rules/ ($(ls .cursor/rules/*.mdc 2>/dev/null | wc -l) .mdc files)" \
      || echo -e "  ${YELLOW}✗${NC} Cursor    .cursor/rules/ missing"
    [[ -f ".github/copilot-instructions.md" ]] \
      && echo -e "  ${GREEN}✓${NC} Copilot   .github/copilot-instructions.md" \
      || echo -e "  ${YELLOW}✗${NC} Copilot   .github/copilot-instructions.md missing"
    [[ -f "adapters/aider.md" ]] \
      && echo -e "  ${GREEN}✓${NC} Aider     adapters/aider.md" \
      || echo -e "  ${YELLOW}✗${NC} Aider     adapters/aider.md missing"
    echo ""
    echo -e "  ${GREEN}✓${NC} Claude    native (hooks in core/hooks/)"
    ;;

  *)
    echo -e "${RED}Unknown engine: $ENGINE${NC}"
    usage
    ;;
esac
